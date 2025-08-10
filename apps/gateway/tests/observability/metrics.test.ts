import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { TestMockAgent } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';

let server: Awaited<ReturnType<typeof buildTestServer>>;
let mocks: TestMockAgent;

beforeAll(async () => {
  server = await buildTestServer({ withMetrics: true, withRateLimit: false });
  mocks = new TestMockAgent();
});

afterAll(async () => {
  await server.close();
  await mocks.close();
});

describe('/metrics exposure', () => {
  it('exposes gateway metrics with expected names', async () => {
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const text = res.body as string;
    expect(text).toContain('gateway_http_requests_total');
    expect(text).toContain('gateway_http_request_duration_seconds');
    expect(text).toContain('gateway_extraction_attempts_total');
    expect(text).toContain('gateway_renderer_requests_total');
    expect(text).toContain('gateway_ssr_detection_total');
  });
});
