import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// Use hoisted ref to access mock created inside vi.mock factory
const pageRef = vi.hoisted(() => ({ current: null }));

vi.mock('playwright', () => {
  const pageMock = {
    route: vi.fn(async () => {}),
    goto: vi.fn(async () => {
      throw new Error('TimeoutError: Navigation timeout exceeded');
    }),
    waitForTimeout: vi.fn(async () => {}),
    content: vi.fn(async () => ''),
    context: vi.fn(() => ({ clearCookies: vi.fn(async () => {}) })),
    close: vi.fn(async () => {}),
  };
  pageRef.current = pageMock;

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

describe('renderer service - timeout/failure path', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await fastify.ready();
  });

  afterAll(async () => {
    await closeBrowser();
    await fastify.close();
  });

  it('render_timeout_returns_504_and_closes_page', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/render',
      payload: { url: 'https://example.com' },
    });
    expect(res.statusCode).toBe(504);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(typeof json.renderTime).toBe('number');
    expect(pageRef.current.close).toHaveBeenCalled();
  });
});
