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
  it('exposes_gateway_metrics_with_expected_names', async () => {
    const res = await server.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const text = res.body as string;
    expect(text).toContain('gateway_http_requests_total');
    // Keep only a representative name to avoid duplication with behavior tests
  });
});
