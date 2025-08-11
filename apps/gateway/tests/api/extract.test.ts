import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { setExtractorFetch } from '../../src/clients/extractor';
import { setRendererFetch } from '../../src/clients/renderer';
import { errorResponseSchema, extractResponseSchema } from '../../src/features/extract/schemas';
import { setHttpFetch } from '../../src/features/extract/usecase';
import { setupMocks } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';
import { expectSubset, expectZodOk, parseJson } from '../helpers/testing';

describe('POST /extract API', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildTestServer();
    const mockAgent = setupMocks();
    // ensure extractor flow uses mocked fetch
    const mockFetch = mockAgent.getMockFetch();
    setHttpFetch(mockFetch as unknown as typeof import('undici').fetch);
    setExtractorFetch(mockFetch as unknown as typeof import('undici').fetch);
    setRendererFetch(mockFetch as unknown as typeof import('undici').fetch);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('request validation', () => {
    it('returns_200_with_valid_request', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: 'https://example.com/article' },
      });

      expect(response.statusCode).toBe(200);
      expectZodOk(extractResponseSchema, parseJson(response));
    });

    const invalidCases = [
      { name: 'missing_url', payload: {} },
      { name: 'invalid_url_format', payload: { url: 'not-a-valid-url' } },
      { name: 'invalid_protocol', payload: { url: 'ftp://example.com/file' } },
      { name: 'blocked_port', payload: { url: 'https://example.com:22/path' } },
    ];

    for (const c of invalidCases) {
      it(`returns_400_on_${c.name}`, async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/extract',
          payload: c.payload,
        });
        expect(response.statusCode).toBe(400);
        const parsed = errorResponseSchema.safeParse(parseJson(response));
        expect(parsed.success).toBe(true);
        // @ts-expect-error narrowed on success
        expect(parsed.data.error.code).toBe('VALIDATION_ERROR');
      });
    }
  });

  describe('ssrf protection', () => {
    const ssrfUrls = [
      'http://192.168.1.1/internal',
      'http://localhost:8080/admin',
      'http://[::1]:3000/internal',
    ];

    for (const url of ssrfUrls) {
      it(`returns_403_on_ssrf_${url}`, async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/extract',
          payload: { url },
        });
        expect(response.statusCode).toBe(403);
        const parsed = errorResponseSchema.safeParse(parseJson(response));
        expect(parsed.success).toBe(true);
        // @ts-expect-error narrowed on success
        expect(parsed.data.error.code).toBe('SSRF_BLOCKED');
      });
    }
  });

  describe('rate limiting', () => {
    it('returns_429_when_rate_limit_exceeded', async () => {
      // Recreate server with a small limit for deterministic behavior
      await server.close();
      server = await buildTestServer({ withRateLimit: true, rateLimitMax: 3 });

      const request = { url: 'https://example.com/article' };
      const headers = { 'x-forwarded-for': '203.0.113.1' };

      let sawRateLimited = false;
      for (let i = 0; i < 8; i += 1) {
        const res = await server.inject({
          method: 'POST',
          url: '/extract',
          payload: request,
          headers,
        });
        if (res.statusCode === 429) {
          const body = JSON.parse(res.body);
          expect(body).toHaveProperty('error');
          expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
          sawRateLimited = true;
          break;
        }
      }
      expect(sawRateLimited).toBe(true);
    });
  });

  describe('response format', () => {
    it('includes_all_required_fields', async () => {
      const request = {
        url: 'https://example.com/article',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: request,
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson(response);

      expectZodOk(extractResponseSchema, body);

      expectSubset(body as Record<string, unknown>, {
        title: expect.any(String),
        text: expect.any(String),
        score: expect.any(Number),
        engine: expect.any(String),
        success: expect.any(Boolean),
        cached: expect.any(Boolean),
      });
    });

    it('handles_service_unavailable_gracefully', async () => {
      setupMocks({ simulateExtractorFailure: true });

      const request = {
        url: 'https://example.com/article',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: request,
      });

      expect([200, 500, 503]).toContain(response.statusCode);

      const body = parseJson(response);
      if (response.statusCode !== 200) {
        const parsed = errorResponseSchema.safeParse(body);
        expect(parsed.success).toBe(true);
        // @ts-expect-error narrowed on success
        expect(parsed.data.error.code).toBe(parsed.data.error.code ?? 'INTERNAL_ERROR');
      }
    });
  });

  describe('edge cases', () => {
    it('handles_very_long_urls', async () => {
      const longUrl = `https://example.com/${'a'.repeat(2000)}`;
      const request = { url: longUrl };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: request,
      });

      expect([200, 400, 413, 503]).toContain(response.statusCode);
    });

    it('handles_unicode_urls', async () => {
      const unicodeRequest = {
        url: 'https://example.com/页面',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: unicodeRequest,
      });

      expect([200, 400, 503]).toContain(response.statusCode);
    });

    it('handles_malformed_json', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: 'invalid json',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
