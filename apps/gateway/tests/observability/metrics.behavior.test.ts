import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { setExtractorFetch } from '../../src/clients/extractor';
import { setRendererFetch } from '../../src/clients/renderer';
import { setHttpFetch } from '../../src/features/extract/usecase';
import { setupMocks } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';
import { expectCounterIncreased, parsePromText } from '../helpers/testing';

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

const fetchMetrics = async () => {
  const res = await server.inject({ method: 'GET', url: '/metrics' });
  expect(res.statusCode).toBe(200);
  return parsePromText(res.body as string);
};

describe('metrics plugin behavior', () => {
  it('counts_GET_/health_with_proper_labels', async () => {
    const h = await server.inject({ method: 'GET', url: '/health' });
    expect(h.statusCode).toBe(200);

    const samples = await fetchMetrics();
    const total = samples.find(
      (s) =>
        s.name === 'gateway_http_requests_total' &&
        s.labels.method === 'GET' &&
        s.labels.endpoint === '/health' &&
        s.labels.status_code === '200'
    );
    expect(total?.value).toBeGreaterThan(0);

    const durationCount = samples.find(
      (s) =>
        s.name === 'gateway_http_request_duration_seconds_count' &&
        s.labels.method === 'GET' &&
        s.labels.endpoint === '/health'
    );
    expect(durationCount?.value).toBeGreaterThan(0);
  });

  it('does_not_count_/metrics_endpoint_itself', async () => {
    const before = await fetchMetrics();
    await server.inject({ method: 'GET', url: '/metrics' });
    const after = await fetchMetrics();
    const beforeVal = before.find(
      (s) => s.name === 'gateway_http_requests_total' && s.labels.endpoint === '/metrics'
    )?.value;
    const afterVal = after.find(
      (s) => s.name === 'gateway_http_requests_total' && s.labels.endpoint === '/metrics'
    )?.value;
    expect(afterVal ?? 0).toBe(beforeVal ?? 0);
  });

  it('normalizes_query_string_for_endpoint_label', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/extract?foo=bar',
      payload: { url: 'https://example.com/article' },
    });
    expect(res.statusCode).toBe(200);

    const samples = await fetchMetrics();
    const match = samples.find(
      (s) =>
        s.name === 'gateway_http_requests_total' &&
        s.labels.method === 'POST' &&
        s.labels.endpoint === '/extract' &&
        s.labels.status_code === '200'
    );
    expect(Boolean(match)).toBe(true);
  });

  it('counts_POST_/extract_with_proper_labels_success_path', async () => {
    const before = await fetchMetrics();
    const ok = await server.inject({
      method: 'POST',
      url: '/extract',
      payload: { url: 'https://example.com/article' },
    });
    expect(ok.statusCode).toBe(200);
    const after = await fetchMetrics();
    expectCounterIncreased(before, after, 'gateway_http_requests_total', {
      method: 'POST',
      endpoint: '/extract',
      status_code: '200',
    });
  });

  it('sets_correct_content_type_for_prometheus', async () => {
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
  });
});
