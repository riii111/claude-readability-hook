import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch as undiciFetch } from 'undici';
import type { z } from 'zod';
import { ErrorCode, type GatewayError, createError } from '../../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../../core/types.js';
import { config } from '../../../../lib/config.js';
import {
  TIME_CONSTANTS,
  createTimeoutSignal,
  createUserAgent,
} from '../../../../lib/http-utils.js';
import { trackExtractionAttempt } from '../../../../lib/metrics.js';
import { rateLimiter } from '../../../../lib/rate-limiter.js';
import { truncateCodeBlocks } from '../../../../lib/text-utils.js';
import { StackOverflowItemSchema, StackOverflowResponseSchema } from './schemas.js';

export const handleStackOverflow = (url: URL): ResultAsync<ExtractResponse, GatewayError> => {
  const questionId = extractQuestionId(url);

  if (!questionId) {
    return errAsync(createError(ErrorCode.BadRequest, 'Invalid StackOverflow URL format'));
  }

  if (
    !rateLimiter.canProceed(RATE_LIMIT_KEY, config.soMaxRpm, TIME_CONSTANTS.RATE_LIMIT_WINDOW_MS)
  ) {
    return errAsync(
      createError(ErrorCode.TooManyRequests, 'StackOverflow API rate limit (client-side)')
    );
  }

  const keyParam = process.env.STACKEXCHANGE_KEY
    ? `&key=${encodeURIComponent(process.env.STACKEXCHANGE_KEY)}`
    : '';
  const questionUrl = `${STACK_EXCHANGE_API}/questions/${questionId}?site=stackoverflow&filter=withbody${keyParam}`;
  const answersUrl = `${STACK_EXCHANGE_API}/questions/${questionId}/answers?site=stackoverflow&sort=votes&pagesize=50&filter=withbody${keyParam}`;

  const fetchQuestion = fetchStackOverflowData(questionUrl, StackOverflowItemSchema);
  const fetchAnswers = fetchStackOverflowData(answersUrl, StackOverflowItemSchema);

  const start = Date.now();
  return fetchQuestion
    .andThen((question) =>
      fetchAnswers.map((answers) => formatStackOverflowContent(question, answers))
    )
    .map((res) => {
      const dur = Date.now() - start;
      trackExtractionAttempt(ExtractionEngine.StackOverflowAPI, true, dur, false);
      return res;
    })
    .mapErr((e) => {
      const dur = Date.now() - start;
      trackExtractionAttempt(ExtractionEngine.StackOverflowAPI, false, dur, false);
      return e;
    });
};

let externalFetch: typeof undiciFetch = undiciFetch;

export function setStackOverflowFetch(fn: typeof undiciFetch) {
  externalFetch = fn;
}

const fetchStackOverflowData = <T extends z.ZodTypeAny>(
  apiUrl: string,
  schema: T
): ResultAsync<z.infer<ReturnType<typeof StackOverflowResponseSchema<T>>>, GatewayError> =>
  ResultAsync.fromPromise(
    externalFetch(apiUrl, {
      ...createTimeoutSignal(config.fetchTimeoutMs),
      headers: createUserAgent('stackoverflow'),
    }),
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
      const parsed = StackOverflowResponseSchema(schema).safeParse(json);
      if (!parsed.success) {
        return errAsync(
          createError(
            ErrorCode.InternalError,
            `Invalid StackOverflow response: ${parsed.error.message}`
          )
        );
      }
      return okAsync(parsed.data);
    });

const formatStackOverflowContent = (
  question: { items: z.infer<typeof StackOverflowItemSchema>[]; has_more: boolean },
  answers: { items: z.infer<typeof StackOverflowItemSchema>[]; has_more: boolean }
): ExtractResponse => {
  const questionItem = question.items[0] ?? ({} as z.infer<typeof StackOverflowItemSchema>);
  const title = questionItem?.title ?? 'StackOverflow Question';

  const contentParts: string[] = [];

  if (questionItem?.body_markdown) {
    contentParts.push(`# Question\n${truncateCodeBlocks(questionItem.body_markdown)}`);
  } else if (questionItem?.body) {
    contentParts.push(`# Question (HTML)\n${truncateCodeBlocks(questionItem.body)}`);
  }

  const topAnswers = answers.items.slice(0, config.soTopAnswersLimit);
  topAnswers.forEach((answer, index) => {
    if (answer.body_markdown) {
      contentParts.push(`\n## Answer ${index + 1}\n${truncateCodeBlocks(answer.body_markdown)}`);
    } else if (answer.body) {
      contentParts.push(`\n## Answer ${index + 1} (HTML)\n${truncateCodeBlocks(answer.body)}`);
    }
  });

  const text = contentParts.join('\n');

  const answerAuthors = answers.items
    .map(
      (a) =>
        a.owner?.display_name ?? (a.owner?.user_id != null ? String(a.owner.user_id) : undefined)
    )
    .filter((v): v is string => Boolean(v));

  const qAuthor =
    questionItem?.owner?.display_name ??
    (questionItem?.owner?.user_id != null ? String(questionItem.owner.user_id) : undefined);

  const uniqueAuthors = new Set([qAuthor, ...answerAuthors].filter(Boolean)).size;
  const score =
    (question.items.length > 0 ? 200 : 0) +
    topAnswers.length * 180 +
    uniqueAuthors * 120 +
    text.length * 0.45;

  return {
    title,
    text,
    engine: ExtractionEngine.StackOverflowAPI,
    score,
    cached: false,
    success: true,
  };
};

const extractQuestionId = (url: URL): string | null => {
  const match = url.pathname.match(/\/questions\/(\d+)\b/);
  return match?.[1] ?? null;
};

const STACK_EXCHANGE_API = 'https://api.stackexchange.com/2.3';
const RATE_LIMIT_KEY = 'stackoverflow';
