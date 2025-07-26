import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { extractHandler } from './features/extract/controller.js';
import { healthHandler } from './features/health/controller.js';
import { ExtractRequest } from './core/types.js';

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

  // CORS設定: Claude Codeなどの外部ツールからのアクセスを許可
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Routes
  fastify.get('/health', healthHandler);
  fastify.post<{ Body: ExtractRequest }>('/extract', extractHandler);

  // グローバルエラーハンドラー
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