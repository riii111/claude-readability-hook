import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { setupExtractRoutes } from '../../src/features/extract';
import { setupHealthRoutes } from '../../src/features/health/controller';
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

  await setupExtractRoutes(server);
  await setupHealthRoutes(server);

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
