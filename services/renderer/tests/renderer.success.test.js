import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// Mock Playwright to avoid launching a real browser
vi.mock('playwright', () => {
  const pageMock = {
    route: vi.fn(async () => {}),
    goto: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    content: vi.fn(async () => '<html><body><div id="app">Rendered</div></body></html>'),
    context: vi.fn(() => ({ clearCookies: vi.fn(async () => {}) })),
    close: vi.fn(async () => {}),
  };

  const contextMock = {
    newPage: vi.fn(async () => pageMock),
    close: vi.fn(async () => {}),
  };

  const browserMock = {
    newContext: vi.fn(async () => contextMock),
    close: vi.fn(async () => {}),
  };

  return {
    chromium: {
      launch: vi.fn(async () => browserMock),
    },
  };
});

// Import after mocks with dynamic import to ensure NODE_ENV is set before module evaluation
const Renderer = await import('../renderer.js');
const { fastify, validateUrlSecurity, closeBrowser } = Renderer;

describe('renderer service - success paths', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await fastify.ready();
  });

  afterAll(async () => {
    await closeBrowser();
    await fastify.close();
  });

  it('health_returns_200', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe('healthy');
    expect(json.service).toBe('renderer');
  });

  it('render_rejects_bad_url_with_400', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/render',
      payload: { url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('render_success_returns_html_and_metrics', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/render',
      payload: { url: 'https://example.com' },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(typeof json.html).toBe('string');
    expect(typeof json.renderTime).toBe('number');
    expect(json.blockedResourceCount).toBeGreaterThanOrEqual(0);
  });

  it('validateUrlSecurity_rejects_private_ip', () => {
    expect(() => validateUrlSecurity('http://127.0.0.1')).toThrow();
  });
});
