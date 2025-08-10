import { MockAgent, setGlobalDispatcher } from 'undici';
import type { MockInterceptor } from 'undici/types/mock-interceptor';

export class TestMockAgent {
  private agent: MockAgent;
  private extractorUrl: string;
  private rendererUrl: string;

  constructor() {
    this.agent = new MockAgent();
    this.agent.disableNetConnect();
    setGlobalDispatcher(this.agent);

    this.extractorUrl = process.env.EXTRACTOR_URL || 'http://extractor:8000';
    this.rendererUrl = process.env.RENDERER_URL || 'http://renderer:3001';
  }

  get mockAgent() {
    return this.agent;
  }

  mockExtractor(): MockInterceptor.MockClient {
    return this.agent.get(this.extractorUrl);
  }

  mockRenderer(): MockInterceptor.MockClient {
    return this.agent.get(this.rendererUrl);
  }

  mockExternal(url: string): MockInterceptor.MockClient {
    return this.agent.get(url);
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
    this.agent = new MockAgent();
    this.agent.disableNetConnect();
    setGlobalDispatcher(this.agent);
  }

  close() {
    return this.agent.close();
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
