import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { extractHandler } from './features/extract/controller';
import {
  errorResponseSchema,
  extractRequestSchema,
  extractResponseSchema,
} from './features/extract/schemas';
import { healthHandler } from './features/health/controller';
import { config } from './lib/config';
import { metricsPlugin } from './lib/metrics-plugin';

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: config.logLevel,
    },
  }).withTypeProvider<ZodTypeProvider>();

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
  });

  await server.register(metricsPlugin);

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

  return server;
}
