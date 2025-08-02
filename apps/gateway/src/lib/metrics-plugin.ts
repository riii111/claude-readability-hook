import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { register, trackHttpRequest } from './metrics.js';

interface RequestTiming {
  startTime: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    timing?: RequestTiming;
  }
}

async function metricsPlugin(
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

    const duration = Date.now() - request.timing.startTime;
    const endpoint = request.routeOptions?.url || getStaticEndpoint(request.url);

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

function getStaticEndpoint(url: string): string {
  const path = url.split('?')[0] || '/';

  if (path === '/extract') return '/extract';
  if (path === '/health') return '/health';
  if (path === '/metrics') return '/metrics';

  return '/unknown';
}

const metricsPluginWrapped = fp(metricsPlugin, {
  fastify: '5.x',
  name: 'metrics',
});

export { metricsPluginWrapped as metricsPlugin };
