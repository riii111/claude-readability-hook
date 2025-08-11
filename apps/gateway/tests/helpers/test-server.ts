import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { GatewayError } from '../../src/core/errors';
import { extractHandler } from '../../src/features/extract/controller';
import {
  errorResponseSchema,
  extractRequestSchema,
  extractResponseSchema,
} from '../../src/features/extract/schemas';
import { healthHandler } from '../../src/features/health/controller';
import { metricsPlugin } from '../../src/lib/metrics-plugin';

export interface TestServerOptions {
  withRateLimit?: boolean;
  rateLimitMax?: number;
  withMetrics?: boolean;
}

export async function createTestServer(options: TestServerOptions = {}): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  if (options.withRateLimit) {
    await server.register(rateLimit, {
      max: options.rateLimitMax || 2,
      timeWindow: '1 minute',
    });
  }

  if (options.withMetrics) {
    await server.register(metricsPlugin);
  }

  server.get('/health', healthHandler);

  server.post('/extract', {
    schema: {
      body: extractRequestSchema,
      response: {
        200: extractResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    handler: extractHandler,
  });

  // Determine if an error originates from request validation (schema/URL parsing)
  const isValidationError = (error: FastifyError | GatewayError): boolean => {
    const hasValidationArray =
      'validation' in error && Array.isArray((error as Partial<FastifyError>).validation);
    const isFastifyValidation = 'code' in error && error.code === 'FST_ERR_VALIDATION';
    const isInvalidUrl = 'code' in error && error.code === 'ERR_INVALID_URL';
    return Boolean(hasValidationArray || isFastifyValidation || isInvalidUrl);
  };

  // Build a normalized error response payload
  const createErrorResponse = (code: string, message: string, statusCode: number) => ({
    error: { code, message, statusCode },
  });

  // Centralized error mapping for tests: prefer deterministic JSON shapes
  server.setErrorHandler(function (
    this: FastifyInstance,
    error: FastifyError | GatewayError,
    request,
    reply
  ): void {
    request.log.error(error);

    // Map all validation failures (schema/url) to HTTP 400
    if (isValidationError(error)) {
      reply.code(400).send(createErrorResponse('VALIDATION_ERROR', 'Validation error', 400));
      return;
    }

    // Guard: rate limit errors → HTTP 429 with normalized code
    if ('statusCode' in error && error.statusCode === 429) {
      reply
        .code(429)
        .send(
          createErrorResponse('RATE_LIMIT_EXCEEDED', error.message || 'Rate limit exceeded', 429)
        );
      return;
    }

    // Fallback: propagate status when available, else 500
    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    reply
      .code(statusCode)
      .send(createErrorResponse('INTERNAL_ERROR', 'Internal server error', statusCode));
    return;
  });

  return server;
}

export async function buildTestServer(options: TestServerOptions = {}): Promise<FastifyInstance> {
  const testOptions = {
    withRateLimit: true,
    rateLimitMax: 100,
    withMetrics: false,
    ...options,
  };

  const server = await createTestServer(testOptions);
  await server.ready();
  return server;
}
