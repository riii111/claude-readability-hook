import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ExtractRequest } from './core/types.js';
import { extractHandler } from './features/extract/controller.js';
import { healthHandler } from './features/health/controller.js';

export function createServer(): FastifyInstance {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: process.env.NODE_ENV !== 'production',
        },
      },
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Enable CORS for external tools like Claude Code
  fastify.register(cors, {
    origin: true,
    credentials: true,
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
