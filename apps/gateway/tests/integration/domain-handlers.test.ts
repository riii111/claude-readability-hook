import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { setExtractorFetch } from '../../src/clients/extractor';
import { setRendererFetch } from '../../src/clients/renderer';
import { setRedditFetch } from '../../src/features/extract/handlers/reddit/usecase';
import { setStackOverflowFetch } from '../../src/features/extract/handlers/stackoverflow/usecase';
import { extractResponseSchema } from '../../src/features/extract/schemas';
import { setHttpFetch } from '../../src/features/extract/usecase';
import { expectZodOk, parseJson } from '../helpers/testing';
type UndiciFetch = typeof import('undici')['fetch'];
import { loadJsonFixture } from '../helpers/fixtures';
import { TestMockAgent } from '../helpers/mock-setup';
import { buildTestServer } from '../helpers/test-server';

let server: Awaited<ReturnType<typeof buildTestServer>>;
let mocks: TestMockAgent;

beforeAll(async () => {
  server = await buildTestServer({ withRateLimit: false });
  mocks = new TestMockAgent();

  const mockFetch = mocks.getMockFetch() as unknown as UndiciFetch;
  setHttpFetch(mockFetch);
  setExtractorFetch(mockFetch);
  setRendererFetch(mockFetch);
  setStackOverflowFetch(mockFetch);
  setRedditFetch(mockFetch);
});

afterAll(async () => {
  await server.close();
  await mocks.close();
});

describe('Domain handlers', () => {
  it('StackOverflow handler returns domain engine with formatted content', async () => {
    const q = loadJsonFixture('so_question.json');
    const a = loadJsonFixture('so_answers.json');

    // Intercept StackExchange API calls
    // question
    mocks
      .mockExternal('https://api.stackexchange.com')
      .intercept({ path: /\/2\.3\/questions\/\d+$/, method: 'GET' })
      .reply(200, q);
    // answers
    mocks
      .mockExternal('https://api.stackexchange.com')
      .intercept({ path: /\/2\.3\/questions\/\d+\/answers$/, method: 'GET' })
      .reply(200, a);

    const res = await server.inject({
      method: 'POST',
      url: '/extract',
      payload: { url: 'https://stackoverflow.com/questions/123456/how-to-foo' },
    });

    expect(res.statusCode).toBe(200);
    const body = parseJson<{ engine: string; text: string; score: number }>(res);
    expectZodOk(extractResponseSchema, body);
    expect(body.engine).toBe('stackoverflow-api');
    expect(body.text).toContain('# Question');
    expect(body.text).toContain('## Answer 1');
    expect(body.score).toBeGreaterThan(0);
  });

  it('Reddit handler returns domain engine with flattened comments', async () => {
    const redditJson = loadJsonFixture('reddit_thread.json');

    mocks
      .mockExternal('https://www.reddit.com')
      .intercept({ path: /\/comments\/abc123\/.*\.json/, method: 'GET' })
      .reply(200, redditJson);

    const res = await server.inject({
      method: 'POST',
      url: '/extract',
      payload: { url: 'https://reddit.com/r/test/comments/abc123/title' },
    });

    expect(res.statusCode).toBe(200);
    const body = parseJson<{ engine: string; text: string; score: number }>(res);
    expectZodOk(extractResponseSchema, body);
    expect(body.engine).toBe('reddit-json');
    expect(body.text).toContain('# Sample Reddit Thread');
    expect(body.text).toContain('## Comment 1');
    expect(body.score).toBeGreaterThan(0);
  });
});
