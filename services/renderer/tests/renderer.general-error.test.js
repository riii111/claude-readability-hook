import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// Mock Playwright to simulate a general error (non-timeout)
vi.mock('playwright', () => {
  const pageMock = {
    route: vi.fn(async () => {}),
    goto: vi.fn(async () => {
      throw new Error('boom');
    }),
    waitForTimeout: vi.fn(async () => {}),
    content: vi.fn(async () => ''),
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

const Renderer = await import('../renderer.js');
const { fastify, closeBrowser } = Renderer;

describe('renderer service - general error path', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await closeBrowser();
    await fastify.close();
  });

  it('render_general_error_returns_500', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/render',
      payload: { url: 'https://example.com' },
    });
    expect(res.statusCode).toBe(500);
    const json = res.json();
    expect(json.success).toBe(false);
  });
});
