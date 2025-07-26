import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HealthResponse } from '../../core/types.js';

export async function healthHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
  try {
    const response = await fetch(
      `${process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000'}/health`,
      { signal: AbortSignal.timeout(5000) }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function checkRendererHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      `${process.env.RENDERER_ENDPOINT || 'http://renderer:3000'}/health`,
      { signal: AbortSignal.timeout(5000) }
    );
    return response.ok;
  } catch {
    return false;
  }
}