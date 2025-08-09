import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { ErrorCode, type GatewayError, createError } from '../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../core/types.js';
import { config } from '../../../lib/config.js';
import { truncateCodeBlocks } from '../../../lib/text-utils.js';

interface RedditListing<T> {
  readonly data: {
    readonly children: Array<{
      readonly kind: string;
      readonly data: T;
    }>;
  };
}

interface RedditPost {
  readonly title: string;
  readonly selftext?: string;
  readonly selftext_html?: string;
  readonly url?: string;
  readonly author?: string;
  readonly subreddit?: string;
}

interface RedditComment {
  readonly body?: string;
  readonly body_html?: string;
  readonly author?: string;
  readonly score?: number;
  readonly replies?: RedditListing<RedditComment> | '';
}

interface FlattenedComment {
  readonly body: string;
  readonly score: number;
  readonly author: string | undefined;
}

const userAgentHeaders = {
  'User-Agent': 'claude-readability-hook/reddit-handler',
};
// --- politeness throttle (min interval between requests) & content utilities ---
const REDDIT_MIN_INTERVAL_MS = 600; // stay gentle for unauthenticated .json
let lastRedditFetchAt = 0;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const ensureRedditCooldown = async () => {
  const now = Date.now();
  const wait = lastRedditFetchAt + REDDIT_MIN_INTERVAL_MS - now;
  if (wait > 0) await delay(wait);
  lastRedditFetchAt = Date.now();
};

const isRedditThread = (url: URL): boolean => /\/comments\/[A-Za-z0-9]+/.test(url.pathname);

const createRedditJsonUrl = (url: URL): URL => {
  const jsonUrl = new URL(url.toString());
  jsonUrl.hostname = 'www.reddit.com';

  if (!jsonUrl.pathname.endsWith('/')) {
    jsonUrl.pathname += '/';
  }
  jsonUrl.pathname += '.json';

  jsonUrl.searchParams.set('raw_json', '1');
  jsonUrl.searchParams.set('sort', 'top');
  jsonUrl.searchParams.set('limit', '100');
  jsonUrl.searchParams.set('depth', '2');

  return jsonUrl;
};

const flattenComments = (comment: RedditComment, depth = 0): FlattenedComment[] => {
  const flattened: FlattenedComment[] = [];

  if (!comment.body) {
    return flattened;
  }

  flattened.push({
    body: comment.body,
    score: comment.score ?? 0,
    author: comment.author,
  });

  if (depth === 0 && comment.replies && typeof comment.replies !== 'string') {
    const replyComments = comment.replies.data.children.map((child) => child.data);
    const topReplies = replyComments.slice(0, 5);

    for (const reply of topReplies) {
      flattened.push(...flattenComments(reply, 1));
    }
  }

  return flattened;
};

const formatRedditContent = (
  posts: RedditListing<RedditPost>,
  comments: RedditListing<RedditComment>
): ExtractResponse => {
  const post = posts.data.children[0]?.data;
  const title = post?.title ?? 'Reddit Thread';

  const contentParts: string[] = [`# ${title}`];

  if (post?.selftext) {
    contentParts.push(
      `_u/${post.author} in r/${post.subreddit}_\n\n${truncateCodeBlocks(post.selftext)}`
    );
  }

  const topLevelComments = comments.data.children.map((child) => child.data).slice(0, 20);

  const flattenedComments: FlattenedComment[] = [];

  for (const comment of topLevelComments) {
    flattenedComments.push(...flattenComments(comment, 0));
  }

  flattenedComments.forEach((comment, index) => {
    contentParts.push(
      `\n## Comment ${index + 1} (score:${comment.score}, by:${comment.author})\n${truncateCodeBlocks(comment.body)}`
    );
  });

  const text = contentParts.join('\n').trim();
  const totalScore = flattenedComments.reduce(
    (sum, comment) => sum + Math.max(0, comment.score),
    0
  );

  const uniqueAuthors = new Set([
    ...flattenedComments.map((c) => c.author).filter((a): a is string => Boolean(a)),
    ...(post?.author ? [post.author] : []),
  ]).size;

  const score =
    flattenedComments.length * 100 + totalScore * 2 + uniqueAuthors * 80 + text.length * 0.3;

  return {
    title,
    text,
    engine: ExtractionEngine.RedditJSON,
    score,
    cached: false,
  };
};

export const handleReddit = (url: URL): ResultAsync<ExtractResponse, GatewayError> => {
  if (!isRedditThread(url)) {
    return errAsync(createError(ErrorCode.BadRequest, 'Not a Reddit thread URL'));
  }

  const jsonUrl = createRedditJsonUrl(url);

  return ResultAsync.fromPromise(
    (async () => {
      await ensureRedditCooldown();
      return fetch(jsonUrl, {
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
        headers: userAgentHeaders,
      });
    })(),
    (error) => createError(ErrorCode.ServiceUnavailable, String(error))
  )
    .andThen((response) =>
      response.ok
        ? okAsync(response)
        : errAsync(createError(ErrorCode.ServiceUnavailable, `HTTP ${response.status}`))
    )
    .andThen((response) =>
      ResultAsync.fromPromise(
        response.json() as Promise<[RedditListing<RedditPost>, RedditListing<RedditComment>]>,
        (error) => createError(ErrorCode.InternalError, String(error))
      )
    )
    .map(([posts, comments]) => formatRedditContent(posts, comments));
};
