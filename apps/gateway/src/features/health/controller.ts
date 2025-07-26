import type { FastifyReply, FastifyRequest } from 'fastify';
import { ResultAsync } from 'neverthrow';
import type { HealthResponse } from '../../core/types.js';

export async function healthHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const response: HealthResponse = {
    status: 'healthy',
    timestamp: Date.now(),
    services: {
      extractor: await checkExtractorHealth(),
      renderer: await checkRendererHealth(),
    },
  };

  reply.code(200).send(response);
}

async function checkExtractorHealth(): Promise<boolean> {
  const healthCheck = ResultAsync.fromPromise(
    fetch(`${process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000'}/health`, {
      signal: AbortSignal.timeout(5000),
    }),
    () => 'Extractor health check failed'
  );

  const result = await healthCheck;
  return result.map((response) => response.ok).unwrapOr(false);
}

async function checkRendererHealth(): Promise<boolean> {
  const healthCheck = ResultAsync.fromPromise(
    fetch(`${process.env.RENDERER_ENDPOINT || 'http://renderer:3000'}/health`, {
      signal: AbortSignal.timeout(5000),
    }),
    () => 'Renderer health check failed'
  );

  const result = await healthCheck;
  return result.map((response) => response.ok).unwrapOr(false);
}
