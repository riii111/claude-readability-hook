import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { ErrorCode, type GatewayError, createError } from '../../../core/errors.js';
import { type ExtractResponse, ExtractionEngine } from '../../../core/types.js';
import { config } from '../../../lib/config.js';

const STACK_EXCHANGE_API = 'https://api.stackexchange.com/2.3';

const createTimeout = () => ({ signal: AbortSignal.timeout(config.fetchTimeoutMs) });

const userAgentHeaders = {
  'User-Agent': 'claude-readability-hook/stackoverflow-handler',
};

interface StackOverflowItem {
  readonly title?: string;
  readonly body?: string;
  readonly body_markdown?: string;
  readonly link?: string;
  readonly score?: number;
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
    contentParts.push(`# Question\n${questionItem.body_markdown}`);
  } else if (questionItem?.body) {
    contentParts.push(`# Question (HTML)\n${questionItem.body}`);
  }

  const topAnswers = answers.items.slice(0, 5);
  topAnswers.forEach((answer, index) => {
    if (answer.body_markdown) {
      contentParts.push(`\n## Answer ${index + 1}\n${answer.body_markdown}`);
    } else if (answer.body) {
      contentParts.push(`\n## Answer ${index + 1} (HTML)\n${answer.body}`);
    }
  });

  const text = contentParts.join('\n');
  const score = (question.items.length > 0 ? 200 : 0) + topAnswers.length * 150 + text.length * 0.5;

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

  const questionUrl = `${STACK_EXCHANGE_API}/questions/${questionId}?site=stackoverflow&filter=withbody`;
  const answersUrl = `${STACK_EXCHANGE_API}/questions/${questionId}/answers?site=stackoverflow&sort=votes&pagesize=50&filter=withbody`;

  const fetchQuestion = fetchStackOverflowData<StackOverflowItem>(questionUrl);
  const fetchAnswers = fetchStackOverflowData<StackOverflowItem>(answersUrl);

  return fetchQuestion.andThen((question) =>
    fetchAnswers.map((answers) => formatStackOverflowContent(question, answers))
  );
};
