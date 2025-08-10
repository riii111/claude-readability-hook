import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { setExtractorFetch } from '../../src/clients/extractor';
import { setRendererFetch } from '../../src/clients/renderer';
import { setHttpFetch } from '../../src/features/extract/usecase';
import { setupMocks } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';

let server: Awaited<ReturnType<typeof buildTestServer>>;

beforeAll(async () => {
  server = await buildTestServer({ withMetrics: true, withRateLimit: false });
  const mockAgent = setupMocks();
  const mockFetch = mockAgent.getMockFetch();
  setHttpFetch(mockFetch as unknown as typeof import('undici').fetch);
  setExtractorFetch(mockFetch as unknown as typeof import('undici').fetch);
  setRendererFetch(mockFetch as unknown as typeof import('undici').fetch);
});

afterAll(async () => {
  await server.close();
});

const fetchMetricsText = async () => {
  const res = await server.inject({ method: 'GET', url: '/metrics' });
  expect(res.statusCode).toBe(200);
  return res.body as string;
};

describe('metrics plugin behavior', () => {
  it('counts GET /health with proper labels', async () => {
    const h = await server.inject({ method: 'GET', url: '/health' });
    expect(h.statusCode).toBe(200);

    const text = await fetchMetricsText();
    expect(text).toContain(
      'gateway_http_requests_total{method="GET",endpoint="/health",status_code="200"} 1'
    );
    expect(text).toMatch(
      /gateway_http_request_duration_seconds_count\{[^}]*method="GET"[^}]*endpoint="\/health"[^}]*}\s+1/
    );
  });

  it('does not count /metrics endpoint itself', async () => {
    const before = await fetchMetricsText();
    await server.inject({ method: 'GET', url: '/metrics' });
    const after = await fetchMetricsText();

    const matches = (s: string) =>
      s.match(/gateway_http_requests_total\{[^}]*endpoint="\/metrics"[^}]*}\s+\d+/g) ?? [];
    expect(matches(before).length).toBe(matches(after).length);
  });

  it('normalizes query string for endpoint label', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/extract?foo=bar',
      payload: { url: 'https://example.com/article' },
    });
    expect(res.statusCode).toBe(200);

    const text = await fetchMetricsText();
    const lines = text.split('\n');
    const matches = lines.filter((l) =>
      /gateway_http_requests_total\{.*method="POST".*endpoint="\/extract".*status_code="200".*}\s+\d+/.test(
        l
      )
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('counts POST /extract with proper labels (success path)', async () => {
    const before = await fetchMetricsText();
    const ok = await server.inject({
      method: 'POST',
      url: '/extract',
      payload: { url: 'https://example.com/article' },
    });
    expect(ok.statusCode).toBe(200);
    const after = await fetchMetricsText();

    const extractCount = (s: string) => {
      const line = s
        .split('\n')
        .find((l) =>
          /gateway_http_requests_total\{.*method="POST".*endpoint="\/extract".*status_code="200".*}\s+\d+/.test(
            l
          )
        );
      if (!line) return 0;
      const m = line.match(/\s(\d+(?:\.\d+)?)$/);
      return m ? Number(m[1]) : 0;
    };
    expect(extractCount(after)).toBeGreaterThan(extractCount(before));
  });

  it('sets correct content-type for Prometheus', async () => {
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
  });
});
