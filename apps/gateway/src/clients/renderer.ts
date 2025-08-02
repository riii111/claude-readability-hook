import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import pRetry from 'p-retry';
import { 
  type RequestInfo as UndiciFetchRequestInfo, 
  type RequestInit as UndiciRequestInit,
  fetch 
} from 'undici';
import { z } from 'zod';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';
import { resultFrom } from '../lib/result.js';

const rendererResponseSchema = z.object({
  html: z.string(),
  renderTime: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
});

type RendererResponse = z.infer<typeof rendererResponseSchema>;

export interface RenderResult {
  html: string;
  renderTime: number;
}

const fetchJson = <T>(
  input: UndiciFetchRequestInfo,
  init?: UndiciRequestInit,
  schema?: z.ZodSchema<T>
): ResultAsync<T, GatewayError> => {
  return resultFrom(
    fetch(input, init),
    ErrorCode.ServiceUnavailable,
    (error) => `HTTP request failed: ${String(error)}`
  ).andThen((response) => {
    if (!response.ok) {
      return errAsync(
        createError(ErrorCode.ServiceUnavailable, `HTTP ${response.status}: ${response.statusText}`)
      );
    }

    return resultFrom(
      response.json() as Promise<T>,
      ErrorCode.ServiceUnavailable,
      (error) => `Failed to parse JSON response: ${String(error)}`
    ).andThen((data) => {
      if (schema) {
        const result = schema.safeParse(data);
        if (!result.success) {
          return errAsync(
            createError(
              ErrorCode.ServiceUnavailable,
              `Invalid response schema: ${result.error.message}`
            )
          );
        }
        return okAsync(result.data);
      }
      return okAsync(data);
    });
  });
};

export class RendererClient {
  render(url: string): ResultAsync<RenderResult, GatewayError> {
    return resultFrom(
      pRetry(
        async () => {
          const result = await fetchJson<RendererResponse>(
            `${config.rendererEndpoint}/render`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
              signal: AbortSignal.timeout(config.fetchTimeoutMs),
            },
            rendererResponseSchema
          );

          if (result.isErr()) {
            throw new Error(result.error.message);
          }

          return result.value;
        },
        {
          retries: 2,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      ),
      ErrorCode.ServiceUnavailable,
      (error) => `Renderer service request failed after retries: ${String(error)}`
    ).andThen((data) => {
      if (!data.success) {
        return errAsync(
          createError(ErrorCode.InternalError, data.error || 'Renderer service failed')
        );
      }

      return okAsync({
        html: data.html,
        renderTime: data.renderTime,
      });
    });
  }
}

export const rendererClient = new RendererClient();
