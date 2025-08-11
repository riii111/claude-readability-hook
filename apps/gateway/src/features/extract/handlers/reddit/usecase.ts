import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import { ErrorCode, type GatewayError, createError } from '../../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../../core/types.js';
import { config } from '../../../../lib/config.js';
import { createTimeoutSignal, createUserAgent, delay } from '../../../../lib/http-utils.js';
import { trackExtractionAttempt } from '../../../../lib/metrics.js';
import { rateLimiter } from '../../../../lib/rate-limiter.js';
import { truncateCodeBlocks } from '../../../../lib/text-utils.js';
import { RedditCommentSchema, RedditListingSchema, RedditPostSchema } from './schemas.js';

let externalFetch: typeof undiciFetch = undiciFetch;

export function setRedditFetch(fn: typeof undiciFetch) {
  externalFetch = fn;
}

export const handleReddit = (url: URL): ResultAsync<ExtractResponse, GatewayError> => {
  if (!isRedditThread(url)) {
    return errAsync(createError(ErrorCode.BadRequest, 'Not a Reddit thread URL'));
  }

  const jsonUrl = createRedditJsonUrl(url);

  const start = Date.now();
  return ResultAsync.fromPromise(
    (async () => {
      await ensureRedditCooldown();
      return externalFetch(jsonUrl, {
        ...createTimeoutSignal(config.fetchTimeoutMs),
        headers: createUserAgent('reddit'),
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
      ResultAsync.fromPromise(response.json() as Promise<unknown>, (error) =>
        createError(ErrorCode.InternalError, String(error))
      )
    )
    .andThen((json) => {
      const parsed = z
        .tuple([RedditListingSchema(RedditPostSchema), RedditListingSchema(RedditCommentSchema)])
        .safeParse(json);
      if (!parsed.success) {
        return errAsync(
          createError(ErrorCode.InternalError, `Invalid Reddit JSON: ${parsed.error.message}`)
        );
      }
      // Cast to our local TS interfaces
      const posts = parsed.data[0] as unknown as RedditListing<RedditPost>;
      const comments = parsed.data[1] as unknown as RedditListing<RedditComment>;
      return okAsync([posts, comments] as const);
    })
    .map(([posts, comments]) => {
      const res = formatRedditContent(posts, comments);
      const dur = Date.now() - start;
      trackExtractionAttempt(ExtractionEngine.RedditJSON, true, dur, false);
      return res;
    })
    .mapErr((e) => {
      const dur = Date.now() - start;
      trackExtractionAttempt(ExtractionEngine.RedditJSON, false, dur, false);
      return e;
    });
};

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

const ensureRedditCooldown = async () => {
  const waitTime = rateLimiter.getWaitTime(RATE_LIMIT_KEY, config.redditMinIntervalMs);
  if (waitTime > 0) {
    await delay(waitTime);
  }
  rateLimiter.recordRequest(RATE_LIMIT_KEY);
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

  const topLevelComments = comments.data.children
    .map((child) => child.data)
    .slice(0, config.redditTopLevelLimit);

  const flattenedComments: FlattenedComment[] = [];

  for (const comment of topLevelComments) {
    flattenedComments.push(...flattenComments(comment, 0));
  }

  const uniqueAuthors = new Set(
    flattenedComments.map((c) => c.author).filter((a): a is string => Boolean(a))
  );

  flattenedComments.forEach((comment, index) => {
    contentParts.push(
      `\n## Comment ${index + 1} (score:${comment.score}, by:${comment.author})\n${comment.body}`
    );
  });

  const text = contentParts.join('\n').trim();
  const totalScore = flattenedComments.reduce(
    (sum, comment) => sum + Math.max(0, comment.score),
    0
  );

  const score =
    flattenedComments.length * 100 + totalScore * 2 + uniqueAuthors.size * 80 + text.length * 0.3;

  return {
    title,
    text,
    engine: ExtractionEngine.RedditJSON,
    score,
    cached: false,
    success: true,
  };
};

const flattenComments = (comment: RedditComment, depth = 0): FlattenedComment[] => {
  const flattened: FlattenedComment[] = [];

  if (!comment.body) {
    return flattened;
  }

  flattened.push({
    body: truncateCodeBlocks(comment.body),
    score: comment.score ?? 0,
    author: comment.author,
  });

  if (depth === 0 && comment.replies && typeof comment.replies !== 'string') {
    const replyComments = comment.replies.data.children.map((child) => child.data);
    const topReplies = replyComments.slice(0, config.redditRepliesPerTopLimit);

    for (const reply of topReplies) {
      flattened.push(...flattenComments(reply, 1));
    }
  }

  return flattened;
};

const isRedditThread = (url: URL): boolean => /\/comments\/[A-Za-z0-9]+/.test(url.pathname);

const RATE_LIMIT_KEY = 'reddit';

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

interface RedditListing<T> {
  readonly data: {
    readonly children: Array<{
      readonly kind: string;
      readonly data: T;
    }>;
  };
}

interface FlattenedComment {
  readonly body: string;
  readonly score: number;
  readonly author: string | undefined;
}
