import type { FastifyReply, FastifyRequest } from 'fastify';
import { ResultAsync } from 'neverthrow';
import { fetch } from 'undici';
import type { HealthResponse } from '../../core/types.js';
import { updateExternalServiceHealth } from '../../lib/metrics.js';

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
  const isHealthy = result.map((response) => response.ok).unwrapOr(false);
  updateExternalServiceHealth('extractor', isHealthy);
  return isHealthy;
}

async function checkRendererHealth(): Promise<boolean> {
  const healthCheck = ResultAsync.fromPromise(
    fetch(`${process.env.RENDERER_ENDPOINT || 'http://renderer:3000'}/health`, {
      signal: AbortSignal.timeout(5000),
    }),
    () => 'Renderer health check failed'
  );

  const result = await healthCheck;
  const isHealthy = result.map((response) => response.ok).unwrapOr(false);
  updateExternalServiceHealth('renderer', isHealthy);
  return isHealthy;
}
