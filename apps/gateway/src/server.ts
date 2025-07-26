import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { Result, ResultAsync } from 'neverthrow';
import { ZodError, type ZodSchema } from 'zod';
import { extractHandler } from './features/extract/controller.js';
import { extractRequestSchema, extractResponseSchema } from './features/extract/schemas.js';
import { healthHandler } from './features/health/controller.js';

export async function createServer(): Promise<FastifyInstance> {
  const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;

  let logger: { level: string; transport?: { target: string; options: object } } = {
    level: process.env.LOG_LEVEL ?? 'info',
  };

  if (pretty) {
    const pinoPrettyResult = await ResultAsync.fromPromise(
      import('pino-pretty' as string),
      () => 'Failed to load pino-pretty'
    );

    pinoPrettyResult.match(
      () => {
        logger = {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
          },
          level: process.env.LOG_LEVEL ?? 'info',
        };
      },
      () => {
        // Fallback to plain logger if pino-pretty not available
      }
    );
  }

  const fastify = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    bodyLimit: 1048576, // 1MB limit for request body
  });

  fastify.setValidatorCompiler(({ schema }) => {
    return (data) => {
      const parseFn = Result.fromThrowable(
        (data: unknown) => (schema as ZodSchema).parse(data),
        (error) => (error instanceof ZodError ? error : new Error(String(error)))
      );
      const parseResult = parseFn(data);

      return parseResult.match(
        (value) => ({ value }),
        (error) => ({ error })
      );
    };
  });

  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'TooManyRequests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        statusCode: 429,
      },
    }),
  });

  fastify.get('/health', healthHandler);
  fastify.post('/extract', {
    schema: {
      body: extractRequestSchema,
      response: {
        200: extractResponseSchema,
      },
    },
    handler: extractHandler,
  });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'BadRequest',
          message: 'Validation error',
          details: error.validation,
        },
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'TooManyRequests',
          message: error.message || 'Rate limit exceeded',
        },
      });
    }

    return reply.status(500).send({
      error: {
        code: 'InternalError',
        message: 'Internal server error',
      },
    });
  });

  return fastify;
}
