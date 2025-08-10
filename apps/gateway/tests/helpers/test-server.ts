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

  // Helper function to check if error is validation error
  const isValidationError = (error: FastifyError | GatewayError): boolean => {
    return (
      ('validation' in error && error.validation) ||
      ('code' in error && error.code === 'FST_ERR_VALIDATION') ||
      ('code' in error && error.code === 'ERR_INVALID_URL')
    );
  };

  // Helper function to create error response
  const createErrorResponse = (code: string, message: string, statusCode: number) => ({
    error: { code, message, statusCode },
  });

  // Simplified error handler following ずんだ先生's advice
  server.setErrorHandler((error: FastifyError | GatewayError, request, reply) => {
    request.log.error(error);

    // 入力バリデーション（Zod/Ajv + URL parsing） → 400に統一
    if (isValidationError(error)) {
      return reply.code(400).send(createErrorResponse('VALIDATION_ERROR', 'Validation error', 400));
    }

    // レート制限（保険）
    if ('statusCode' in error && error.statusCode === 429) {
      return reply
        .code(429)
        .send(
          createErrorResponse('RATE_LIMIT_EXCEEDED', error.message || 'Rate limit exceeded', 429)
        );
    }

    // それ以外は500に集約（テストの期待に沿った形）
    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply
      .code(statusCode)
      .send(createErrorResponse('INTERNAL_ERROR', 'Internal server error', statusCode));
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

export async function injectRequest(
  server: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  headers?: Record<string, string>
) {
  const response = await server.inject({
    method,
    url,
    payload,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json ? response.json() : response.body,
    headers: response.headers,
  };
}
