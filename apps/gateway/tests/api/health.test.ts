import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { buildTestServer } from '../helpers/test-server';

describe('GET /health API', () => {
  let server: FastifyInstance;
  let prevExtractor: string | undefined;
  let prevRenderer: string | undefined;

  beforeAll(async () => {
    // Point health checks to a fast-failing endpoint to avoid slow timeouts
    prevExtractor = process.env.EXTRACTOR_ENDPOINT;
    prevRenderer = process.env.RENDERER_ENDPOINT;
    process.env.EXTRACTOR_ENDPOINT = 'http://127.0.0.1:1';
    process.env.RENDERER_ENDPOINT = 'http://127.0.0.1:1';

    server = await buildTestServer({ withRateLimit: false });
  });

  afterAll(async () => {
    if (server) await server.close();
    if (prevExtractor === undefined) process.env.EXTRACTOR_ENDPOINT = undefined;
    else process.env.EXTRACTOR_ENDPOINT = prevExtractor;
    if (prevRenderer === undefined) process.env.RENDERER_ENDPOINT = undefined;
    else process.env.RENDERER_ENDPOINT = prevRenderer;
  });

  it('returns_200_and_expected_shape', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toHaveProperty('status', 'healthy');
    expect(typeof body.timestamp).toBe('number');
    expect(body).toHaveProperty('services');
    expect(typeof body.services.extractor).toBe('boolean');
    expect(typeof body.services.renderer).toBe('boolean');
  });
});
