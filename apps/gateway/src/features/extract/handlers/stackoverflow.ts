import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { z } from 'zod';
import { ErrorCode, type GatewayError, createError } from '../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../core/types.js';
import { config } from '../../../lib/config.js';
import { trackExtractionAttempt } from '../../../lib/metrics.js';
import { truncateCodeBlocks } from '../../../lib/text-utils.js';

const STACK_EXCHANGE_API = 'https://api.stackexchange.com/2.3';

const createTimeout = () => ({ signal: AbortSignal.timeout(config.fetchTimeoutMs) });

const userAgentHeaders = {
  'User-Agent': 'claude-readability-hook/stackoverflow-handler',
};

// --- rate limit (per-process, rolling 60s window) & content utilities ---
let soTimestamps: number[] = [];

const withinSoRate = (): boolean => {
  const now = Date.now();
  soTimestamps = soTimestamps.filter((t) => now - t < 60_000);
  if (soTimestamps.length >= config.soMaxRpm) return false;
  soTimestamps.push(now);
  return true;
};

const StackOverflowItemSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  body_markdown: z.string().optional(),
  link: z.string().optional(),
  score: z.number().optional(),
  owner: z
    .object({
      display_name: z.string().optional(),
      user_id: z.number().optional(),
    })
    .optional(),
});

const StackOverflowResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    has_more: z.boolean(),
  });

const extractQuestionId = (url: URL): string | null => {
  const match = url.pathname.match(/\/questions\/(\d+)\b/);
  return match?.[1] ?? null;
};

const fetchStackOverflowData = <T extends z.ZodTypeAny>(apiUrl: string, schema: T) =>
  ResultAsync.fromPromise(
    fetch(apiUrl, { ...createTimeout(), headers: userAgentHeaders }),
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
      return parsed.success
        ? okAsync(parsed.data)
        : errAsync(
            createError(ErrorCode.InternalError, `Invalid SO response: ${parsed.error.message}`)
          );
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
    const a = answer as z.infer<typeof StackOverflowItemSchema>;
    if (a.body_markdown) {
      contentParts.push(`\n## Answer ${index + 1}\n${truncateCodeBlocks(a.body_markdown)}`);
    } else if (a.body) {
      contentParts.push(`\n## Answer ${index + 1} (HTML)\n${truncateCodeBlocks(a.body)}`);
    }
  });

  const text = contentParts.join('\n');
  // Completeness-aware scoring: answers count + unique authors + length
  const answerAuthors = answers.items
    .map((a) => {
      const aa = a as z.infer<typeof StackOverflowItemSchema>;
      return (
        aa.owner?.display_name ?? (aa.owner?.user_id != null ? String(aa.owner.user_id) : undefined)
      );
    })
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
  };
};

export const handleStackOverflow = (url: URL): ResultAsync<ExtractResponse, GatewayError> => {
  const questionId = extractQuestionId(url);

  if (!questionId) {
    return errAsync(createError(ErrorCode.BadRequest, 'Invalid StackOverflow URL format'));
  }

  if (!withinSoRate()) {
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
