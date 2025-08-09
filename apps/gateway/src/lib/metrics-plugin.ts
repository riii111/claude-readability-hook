import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { register, trackHttpRequest } from './metrics.js';

export const metricsPlugin = fp(metricsPluginImplementation, {
  fastify: '5.x',
  name: 'metrics',
});

function getStaticEndpoint(url: string): string {
  const path = url.split('?')[0] || '/';

  for (const endpoint of KNOWN_ENDPOINTS) {
    if (path === endpoint) return endpoint;
  }

  return '/unknown';
}

async function metricsPluginImplementation(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    request.timing = {
      startTime: Date.now(),
    };
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.timing) return;

    const endpoint = request.routeOptions?.url || getStaticEndpoint(request.url);

    // Exclude /metrics endpoint from tracking to avoid self-measurement loop
    if (endpoint === '/metrics') return;

    const duration = Date.now() - request.timing.startTime;
    trackHttpRequest(request.method, endpoint, reply.statusCode, duration);
  });

  fastify.get(
    '/metrics',
    {
      schema: {
        response: {
          200: {
            type: 'string',
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const metrics = await register.metrics();
      reply.header('Content-Type', register.contentType).send(metrics);
    }
  );
}

const KNOWN_ENDPOINTS = ['/extract', '/health', '/metrics'] as const;

interface RequestTiming {
  startTime: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    timing?: RequestTiming;
  }
}
