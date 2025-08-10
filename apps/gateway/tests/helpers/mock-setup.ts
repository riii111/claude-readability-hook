type PathMatcher = string | RegExp;

interface InterceptOptions {
  path: PathMatcher;
  method: string;
  query?: Record<string, string>;
}

interface MockReply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

class SimpleInterceptorClient {
  constructor(
    private readonly registry: MockRegistry,
    private readonly origin: string
  ) {}

  intercept(opts: InterceptOptions) {
    return {
      reply: (status: number, body: unknown, extra?: { headers?: Record<string, string> }) => {
        this.registry.add({
          origin: this.origin,
          opts,
          reply: { status, body, headers: extra?.headers },
        });
      },
    };
  }
}

interface RegistryEntry {
  origin: string;
  opts: InterceptOptions;
  reply: MockReply;
}

class MockRegistry {
  private entries: RegistryEntry[] = [];

  add(entry: RegistryEntry) {
    this.entries.push(entry);
  }

  match(url: URL, method: string): MockReply | undefined {
    const origin = url.origin;
    const methodUpper = method.toUpperCase();
    const pathname = url.pathname;

    // Debug logging for CI/local differences
    if (process.env.NODE_ENV === 'test') {
      console.log(`[MockRegistry] Matching ${methodUpper} ${url.toString()}`);
      console.log(`[MockRegistry] Available entries: ${this.entries.length}`);
      this.entries.forEach((entry, i) => {
        console.log(`  [${i}] ${entry.opts.method} ${entry.origin}${entry.opts.path} -> ${JSON.stringify(entry.reply.body).substring(0, 100)}`);
      });
    }

    for (const entry of this.entries) {
      if (!this.isOriginMatch(entry, origin)) continue;
      if (!this.isMethodMatch(entry, methodUpper)) continue;
      if (!this.isPathMatch(entry, pathname)) continue;
      if (!this.isQueryMatch(entry, url)) continue;
      
      if (process.env.NODE_ENV === 'test') {
        console.log(`[MockRegistry] ✓ Matched: ${entry.opts.method} ${entry.origin}${entry.opts.path}`);
      }
      return entry.reply;
    }
    
    if (process.env.NODE_ENV === 'test') {
      console.log(`[MockRegistry] ✗ No match found for ${methodUpper} ${url.toString()}`);
    }
    return undefined;
  }

  private isOriginMatch(entry: RegistryEntry, origin: string): boolean {
    return entry.origin === origin;
  }

  private isMethodMatch(entry: RegistryEntry, methodUpper: string): boolean {
    return entry.opts.method.toUpperCase() === methodUpper;
  }

  private isPathMatch(entry: RegistryEntry, pathname: string): boolean {
    const matcher = entry.opts.path;
    if (typeof matcher === 'string') return matcher === pathname;
    try {
      return matcher.test(pathname);
    } catch {
      return false;
    }
  }

  private isQueryMatch(entry: RegistryEntry, url: URL): boolean {
    const expected = entry.opts.query;
    if (!expected) return true;
    for (const [key, value] of Object.entries(expected)) {
      if (url.searchParams.get(key) !== String(value)) return false;
    }
    return true;
  }

  clear() {
    this.entries = [];
  }
}

export class TestMockAgent {
  private registry = new MockRegistry();
  private extractorUrl: string;
  private rendererUrl: string;
  private originalFetch?: typeof fetch;

  constructor() {
    this.extractorUrl = process.env.EXTRACTOR_ENDPOINT || 'http://extractor:8000';
    this.rendererUrl = process.env.RENDERER_ENDPOINT || 'http://renderer:3000';

    // Store original fetch but don't override globalThis.fetch
    // Instead, we'll inject the mock fetch directly into clients
    this.originalFetch = globalThis.fetch;
  }

  // Get mock fetch function for injection
  getMockFetch(): typeof fetch {
    const registry = this.registry;
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method || 'GET').toUpperCase();
      const url = new URL(typeof input === 'string' ? input : (input as URL).toString());
      const match = registry.match(url, method);
      if (!match) {
        return new Response('Not mocked', { status: 599 });
      }
      const body =
        typeof match.body === 'string' || match.body instanceof Blob
          ? (match.body as BodyInit)
          : JSON.stringify(match.body);
      return new Response(body as BodyInit, { status: match.status, headers: match.headers });
    }) as typeof fetch;
  }

  mockAgent() {
    return { close: () => Promise.resolve() } as unknown as { close: () => Promise<void> };
  }

  mockExtractor(): SimpleInterceptorClient {
    return new SimpleInterceptorClient(this.registry, this.extractorUrl);
  }

  mockRenderer(): SimpleInterceptorClient {
    return new SimpleInterceptorClient(this.registry, this.rendererUrl);
  }

  mockExternal(url: string): SimpleInterceptorClient {
    return new SimpleInterceptorClient(this.registry, url);
  }

  setupExtractorSuccess(
    response = {
      title: 'Test Title',
      text: 'Test content',
      score: 80.0,
      engine: 'trafilatura',
      success: true,
    }
  ) {
    this.mockExtractor()
      .intercept({
        path: '/extract',
        method: 'POST',
      })
      .reply(200, response);
  }

  setupExtractorLowScore() {
    this.mockExtractor()
      .intercept({
        path: '/extract',
        method: 'POST',
      })
      .reply(200, {
        title: '',
        text: 'Short',
        score: 10.0,
        engine: 'trafilatura',
        success: true,
      });
  }

  setupReadabilityMock() {
    const { setMockReadabilityExtractor } = require('../../src/clients/readability');
    const { okAsync } = require('neverthrow');

    setMockReadabilityExtractor({
      extract: (_html: string, _baseUrl?: string) => {
        return okAsync({
          title: 'Readability Extracted Title',
          text: 'Readability extracted content from the HTML document.',
          success: true,
        });
      },
    });
  }

  setupExtractorError() {
    this.mockExtractor()
      .intercept({
        path: '/extract',
        method: 'POST',
      })
      .reply(422, { detail: 'Extraction failed' });
  }

  setupRendererSuccess(html: string) {
    this.mockRenderer()
      .intercept({
        path: '/render',
        method: 'POST',
      })
      .reply(200, {
        html,
        renderTime: 1500,
        success: true,
      });
  }

  setupRendererTimeout() {
    this.mockRenderer()
      .intercept({
        path: '/render',
        method: 'POST',
      })
      .reply(504, {
        success: false,
        error: 'Render timeout',
      });
  }

  setupStackOverflowApi(questionId: string, response: unknown) {
    this.mockExternal('https://api.stackexchange.com')
      .intercept({
        path: `/2.3/questions/${questionId}`,
        method: 'GET',
        query: {
          site: 'stackoverflow',
          filter: '!6WPIomnMOOD(l',
        },
      })
      .reply(200, response);
  }

  setupRedditJson(path: string, response: unknown) {
    this.mockExternal('https://www.reddit.com')
      .intercept({
        path: `${path}.json`,
        method: 'GET',
        query: {
          limit: '500',
          depth: '10',
        },
      })
      .reply(200, response);
  }

  setupRedirect(from: string, to: string, statusCode = 302) {
    const fromUrl = new URL(from);
    this.mockExternal(fromUrl.origin)
      .intercept({
        path: fromUrl.pathname,
        method: 'GET',
      })
      .reply(statusCode, '', {
        headers: {
          location: to,
        },
      });
  }

  setupHtmlResponse(url: string, html: string) {
    const parsed = new URL(url);
    this.mockExternal(parsed.origin)
      .intercept({
        path: parsed.pathname,
        method: 'GET',
      })
      .reply(200, html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
  }

  reset() {
    this.registry.clear();
  }

  close() {
    // No need to restore globalThis.fetch since we don't override it anymore
    return Promise.resolve();
  }
}

let globalMockAgent: TestMockAgent;

export interface MockSetupOptions {
  simulateExtractorFailure?: boolean;
  simulateRendererFailure?: boolean;
  simulateLowScore?: boolean;
}

export function setupMocks(options: MockSetupOptions = {}): TestMockAgent {
  if (!globalMockAgent) {
    globalMockAgent = new TestMockAgent();
  }

  const { simulateExtractorFailure, simulateLowScore } = options;

  if (simulateExtractorFailure) {
    globalMockAgent.setupExtractorError();
  } else if (simulateLowScore) {
    globalMockAgent.setupExtractorLowScore();
  } else {
    globalMockAgent.setupExtractorSuccess();
  }

  globalMockAgent.setupHtmlResponse(
    'https://example.com/article',
    `
    <!DOCTYPE html>
    <html>
    <head><title>Test Article</title></head>
    <body>
      <h1>Test Article</h1>
      <p>This is test content for extraction.</p>
    </body>
    </html>
  `
  );

  return globalMockAgent;
}

export function resetMocks(): void {
  if (globalMockAgent) {
    globalMockAgent.reset();
  }
}

export function closeMocks(): Promise<void> {
  if (globalMockAgent) {
    return globalMockAgent.close();
  }
  return Promise.resolve();
}
