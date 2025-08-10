import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { FastifyInstance } from 'fastify';
import { setupMocks } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';

describe('POST /extract API', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildTestServer();
    setupMocks();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('request validation', () => {
    it('returns_200_with_valid_request', async () => {
      const validRequest = {
        url: 'https://example.com/article',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: validRequest,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('text');
      expect(body).toHaveProperty('score');
      expect(body).toHaveProperty('engine');
      expect(body).toHaveProperty('success');
      expect(typeof body.cached).toBe('boolean');
    });

    it('returns_400_on_missing_url', async () => {
      const invalidRequest = {};

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns_400_on_invalid_url_format', async () => {
      const invalidRequest = {
        url: 'not-a-valid-url',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns_400_on_invalid_protocol', async () => {
      const invalidRequest = {
        url: 'ftp://example.com/file',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns_400_on_blocked_port', async () => {
      const invalidRequest = {
        url: 'https://example.com:22/path',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ssrf protection', () => {
    it('returns_403_on_private_ip', async () => {
      const ssrfRequest = {
        url: 'http://192.168.1.1/internal',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: ssrfRequest,
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error.code).toBe('SSRF_BLOCKED');
    });

    it('returns_403_on_localhost', async () => {
      const ssrfRequest = {
        url: 'http://localhost:8080/admin',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: ssrfRequest,
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SSRF_BLOCKED');
    });

    it('returns_403_on_ipv6_loopback', async () => {
      const ssrfRequest = {
        url: 'http://[::1]:3000/internal',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: ssrfRequest,
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SSRF_BLOCKED');
    });
  });

  describe('rate limiting', () => {
    it('returns_429_when_rate_limit_exceeded', async () => {
      const request = {
        url: 'https://example.com/article',
      };

      const responses = await Promise.all(
        Array(110)
          .fill(null)
          .map(() =>
            server.inject({
              method: 'POST',
              url: '/extract',
              payload: request,
              headers: {
                'x-forwarded-for': '203.0.113.1',
              },
            })
          )
      );

      const rateLimitedResponses = responses.filter((r) => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      const rateLimitedBody = JSON.parse(rateLimitedResponses[0].body);
      expect(rateLimitedBody).toHaveProperty('error');
      expect(rateLimitedBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
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

      const body = JSON.parse(response.body);

      expect(typeof body.title).toBe('string');
      expect(typeof body.text).toBe('string');
      expect(typeof body.score).toBe('number');
      expect(typeof body.engine).toBe('string');
      expect(typeof body.success).toBe('boolean');
      expect(typeof body.cached).toBe('boolean');

      const validEngines = ['trafilatura', 'readability', 'stackoverflow-api', 'reddit-json'];
      expect(validEngines).toContain(body.engine);
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

      const body = JSON.parse(response.body);
      if (response.statusCode !== 200) {
        expect(body).toHaveProperty('error');
        expect(body.error).toHaveProperty('code');
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

      expect([200, 400, 413]).toContain(response.statusCode);
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

      expect([200, 400]).toContain(response.statusCode);
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
