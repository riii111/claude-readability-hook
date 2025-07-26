import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ExtractRequest } from './core/types.js';
import { extractHandler } from './features/extract/controller.js';
import { healthHandler } from './features/health/controller.js';

export function createServer(): FastifyInstance {
  const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;
  const logger = pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
        level: process.env.LOG_LEVEL ?? 'info',
      }
    : { level: process.env.LOG_LEVEL ?? 'info' };

  const fastify = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    bodyLimit: 1048576, // 1MB limit for request body
  });

  // Enable CORS for external tools like Claude Code
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting: 100 requests per minute per IP
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
  fastify.post<{ Body: ExtractRequest }>('/extract', extractHandler);

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

    return reply.status(500).send({
      error: {
        code: 'InternalError',
        message: 'Internal server error',
      },
    });
  });

  return fastify;
}
