import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
type UndiciFetch = typeof import('undici')['fetch'];
import type { FastifyInstance } from 'fastify';
import { setExtractorFetch } from '../../src/clients/extractor';
import { setRendererFetch } from '../../src/clients/renderer';
import { errorResponseSchema, extractResponseSchema } from '../../src/features/extract/schemas';
import { setHttpFetch } from '../../src/features/extract/usecase';
import { HTML_FIXTURES } from '../helpers/fixtures';
import { TestMockAgent } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';
import { expectZodOk, parseJson } from '../helpers/testing';

describe('Extract Flow Integration', () => {
  let server: FastifyInstance;
  let mockAgent: TestMockAgent;

  beforeEach(async () => {
    // Clear cache manager before each test
    const { cacheManager } = await import('../../src/lib/cache.js');
    cacheManager.clear();

    // Clear global mock agent that might interfere
    const { resetMocks } = await import('../helpers/mock-setup.js');
    resetMocks();

    server = await buildTestServer();
    mockAgent = new TestMockAgent();
    // Ensure clean state by resetting registry
    mockAgent.reset();

    const mockFetch = mockAgent.getMockFetch() as unknown as UndiciFetch;
    setHttpFetch(mockFetch);
    setExtractorFetch(mockFetch);
    setRendererFetch(mockFetch);
  });

  afterEach(async () => {
    if (mockAgent) {
      mockAgent.reset();
      await mockAgent.close();
    }
    if (server) {
      await server.close();
    }
  });

  describe('trafilatura_happy_path', () => {
    it('extracts_static_html_successfully', async () => {
      const testUrl = 'https://example.com/article';

      mockAgent.setupHtmlResponse(testUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess({
        title: 'Simple Article',
        text: 'This is a simple test article.',
        score: 85.5,
        engine: 'trafilatura',
        success: true,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: testUrl },
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson<{ title: string; engine: string; success: boolean; score: number }>(
        response
      );
      expect(body.title).toBe('Simple Article');
      expect(body.engine).toBe('trafilatura');
      expect(body.success).toBe(true);
      expect(body.score).toBeGreaterThanOrEqual(50);
    });

    it('returns_cached_result_on_second_request', async () => {
      const testUrl = 'https://example.com/article';

      mockAgent.setupHtmlResponse(testUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess({
        title: 'Test Article',
        text: 'Test content for caching.',
        score: 80.0,
        engine: 'trafilatura',
        success: true,
      });

      const firstResponse = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: testUrl },
      });

      const secondResponse = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: testUrl },
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);

      const secondBody = parseJson<{ cached: boolean }>(secondResponse);
      expect(secondBody.cached).toBe(true);
    });
  });

  describe('readability_fallback', () => {
    it('falls_back_when_extractor_returns_low_score', async () => {
      const testUrl = 'https://example.com/poor-content';

      mockAgent.setupHtmlResponse(testUrl, '<html><body><p>Short</p></body></html>');
      mockAgent.setupExtractorLowScore();
      mockAgent.setupReadabilityMock(); // Readability fallback mock

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: testUrl },
      });

      expect(response.statusCode).toBe(200);
      const body = parseJson<{ engine: string; success: boolean }>(response);
      expectZodOk(extractResponseSchema, body);
      expect(body.engine).toBe('readability');
      expect(body.success).toBe(true);
    });

    it('falls_back_when_extractor_fails', async () => {
      const testUrl = 'https://example.com/broken';

      mockAgent.setupHtmlResponse(testUrl, '<html><body><p>Content</p></body></html>');
      mockAgent.setupExtractorError();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: testUrl },
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = parseJson(response);
      if (response.statusCode === 200) {
        expectZodOk(extractResponseSchema, body);
        expect(['trafilatura', 'readability']).toContain(body.engine);
      } else {
        expectZodOk(errorResponseSchema, body);
      }
    });
  });

  describe('ssr_rendering_branch', () => {
    it('triggers_renderer_for_spa_content', async () => {
      const spaUrl = 'https://example.com/spa';
      const renderedHtml = `<html><body>
        <div id="app">Rendered SPA Content</div>
      </body></html>`;

      mockAgent.setupHtmlResponse(spaUrl, HTML_FIXTURES.spaMarkers);
      mockAgent.setupRendererSuccess(renderedHtml);
      mockAgent.setupExtractorSuccess({
        title: 'SPA Article',
        text: 'Rendered SPA Content',
        score: 75.0,
        engine: 'trafilatura',
        success: true,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: spaUrl },
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson<{ title: string; success: boolean; renderTime?: number }>(response);
      expect(body.title).toBe('SPA Article');
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('renderTime');
    });

    it('handles_renderer_timeout', async () => {
      const spaUrl = 'https://example.com/slow-spa';

      mockAgent.setupHtmlResponse(spaUrl, HTML_FIXTURES.spaMarkers);
      mockAgent.setupRendererTimeout();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: spaUrl },
      });

      expect([200, 503]).toContain(response.statusCode);
    });
  });

  describe('redirect_handling', () => {
    it('follows_302_redirect_with_location', async () => {
      const originalUrl = 'https://example.com/redirect-me';
      const finalUrl = 'https://example.com/final-destination';

      mockAgent.setupRedirect(originalUrl, finalUrl, 302);
      mockAgent.setupHtmlResponse(finalUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: originalUrl },
      });

      expect(response.statusCode).toBe(200);
      const body = parseJson(response);
      expectZodOk(extractResponseSchema, body);
    });

    it('handles_redirect_without_location', async () => {
      const redirectUrl = 'https://example.com/broken-redirect';

      mockAgent
        .mockExternal('https://example.com')
        .intercept({
          path: '/broken-redirect',
          method: 'GET',
        })
        .reply(302, '', {
          headers: {},
        });

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: redirectUrl },
      });

      expect([503, 400]).toContain(response.statusCode);
    });

    it('prevents_infinite_redirect_loops', async () => {
      const loopUrl1 = 'https://example.com/loop1';
      const loopUrl2 = 'https://example.com/loop2';

      mockAgent.setupRedirect(loopUrl1, loopUrl2, 302);
      mockAgent.setupRedirect(loopUrl2, loopUrl1, 302);

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: loopUrl1 },
      });

      expect([503, 400]).toContain(response.statusCode);
    });
  });

  describe('content_limits', () => {
    it('rejects_invalid_content_type', async () => {
      const pdfUrl = 'https://example.com/document.pdf';

      mockAgent
        .mockExternal('https://example.com')
        .intercept({
          path: '/document.pdf',
          method: 'GET',
        })
        .reply(200, 'binary pdf content', {
          headers: {
            'content-type': 'application/pdf',
          },
        });

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: pdfUrl },
      });

      expect([400, 503]).toContain(response.statusCode);
    });

    it('handles_large_content_gracefully', async () => {
      const largeUrl = 'https://example.com/huge-page';
      const hugeHtml = `<html><body>${'<p>Large content</p>\n'.repeat(100000)}</body></html>`;

      mockAgent.setupHtmlResponse(largeUrl, hugeHtml);

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: largeUrl },
      });

      expect([200, 503, 413]).toContain(response.statusCode);
    });
  });

  describe('url_transforms', () => {
    it('transforms_amp_url_before_processing', async () => {
      const ampUrl = 'https://example.com/article/amp';
      const canonicalUrl = 'https://example.com/article';

      mockAgent.setupHtmlResponse(canonicalUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: ampUrl },
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson<{ success: boolean }>(response);
      expect(body.success).toBe(true);
    });

    it('transforms_mobile_url_before_processing', async () => {
      const mobileUrl = 'https://m.example.com/article';
      const desktopUrl = 'https://www.example.com/article';

      mockAgent.setupHtmlResponse(desktopUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: mobileUrl },
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson<{ success: boolean }>(response);
      expect(body.success).toBe(true);
    });

    it('removes_print_parameters_before_processing', async () => {
      const printUrl = 'https://example.com/article?print=1&other=keep';
      const cleanUrl = 'https://example.com/article?other=keep';

      mockAgent.setupHtmlResponse(cleanUrl, HTML_FIXTURES.simple);
      mockAgent.setupExtractorSuccess();

      const response = await server.inject({
        method: 'POST',
        url: '/extract',
        payload: { url: printUrl },
      });

      expect(response.statusCode).toBe(200);

      const body = parseJson<{ success: boolean }>(response);
      expect(body.success).toBe(true);
    });
  });
});
