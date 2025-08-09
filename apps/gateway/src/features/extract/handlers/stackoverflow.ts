import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { ErrorCode, type GatewayError, createError } from '../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../core/types.js';
import { config } from '../../../lib/config.js';
import { truncateCodeBlocks } from '../../../lib/text-utils.js';

const STACK_EXCHANGE_API = 'https://api.stackexchange.com/2.3';

const createTimeout = () => ({ signal: AbortSignal.timeout(config.fetchTimeoutMs) });

const userAgentHeaders = {
  'User-Agent': 'claude-readability-hook/stackoverflow-handler',
};

// --- rate limit (per-process, rolling 60s window) & content utilities ---
const SO_MAX_RPM = 10; // personal use: be gentle (StackExchange anon daily cap is 300)
let soTimestamps: number[] = [];

const withinSoRate = (): boolean => {
  const now = Date.now();
  soTimestamps = soTimestamps.filter((t) => now - t < 60_000);
  if (soTimestamps.length >= SO_MAX_RPM) return false;
  soTimestamps.push(now);
  return true;
};

interface StackOverflowItem {
  readonly title?: string;
  readonly body?: string;
  readonly body_markdown?: string;
  readonly link?: string;
  readonly score?: number;
  readonly owner?: {
    readonly display_name?: string;
    readonly user_id?: number;
  };
}

interface StackOverflowResponse<T> {
  readonly items: readonly T[];
  readonly has_more: boolean;
}

const extractQuestionId = (url: URL): string | null => {
  const match = url.pathname.match(/\/questions\/(\d+)\b/);
  return match?.[1] ?? null;
};

const fetchStackOverflowData = <T>(
  apiUrl: string
): ResultAsync<StackOverflowResponse<T>, GatewayError> =>
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
      ResultAsync.fromPromise(response.json() as Promise<StackOverflowResponse<T>>, (error) =>
        createError(ErrorCode.InternalError, String(error))
      )
    );

const formatStackOverflowContent = (
  question: StackOverflowResponse<StackOverflowItem>,
  answers: StackOverflowResponse<StackOverflowItem>
): ExtractResponse => {
  const questionItem = question.items[0];
  const title = questionItem?.title ?? 'StackOverflow Question';

  const contentParts: string[] = [];

  if (questionItem?.body_markdown) {
    contentParts.push(`# Question\n${truncateCodeBlocks(questionItem.body_markdown)}`);
  } else if (questionItem?.body) {
    contentParts.push(`# Question (HTML)\n${truncateCodeBlocks(questionItem.body)}`);
  }

  const topAnswers = answers.items.slice(0, 5);
  topAnswers.forEach((answer, index) => {
    if (answer.body_markdown) {
      contentParts.push(`\n## Answer ${index + 1}\n${truncateCodeBlocks(answer.body_markdown)}`);
    } else if (answer.body) {
      contentParts.push(`\n## Answer ${index + 1} (HTML)\n${truncateCodeBlocks(answer.body)}`);
    }
  });

  const text = contentParts.join('\n');
  // Completeness-aware scoring: answers count + unique authors + length
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

  const questionUrl = `${STACK_EXCHANGE_API}/questions/${questionId}?site=stackoverflow&filter=withbody`;
  const answersUrl = `${STACK_EXCHANGE_API}/questions/${questionId}/answers?site=stackoverflow&sort=votes&pagesize=50&filter=withbody`;

  const fetchQuestion = fetchStackOverflowData<StackOverflowItem>(questionUrl);
  const fetchAnswers = fetchStackOverflowData<StackOverflowItem>(answersUrl);

  return fetchQuestion.andThen((question) =>
    fetchAnswers.map((answers) => formatStackOverflowContent(question, answers))
  );
};
