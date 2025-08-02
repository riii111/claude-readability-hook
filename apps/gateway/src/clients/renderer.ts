import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import { fetch } from 'undici';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';
import { resultFrom } from '../lib/result.js';

export interface RenderResult {
  html: string;
  renderTime: number;
}

export class RendererClient {
  render(url: string): ResultAsync<RenderResult, GatewayError> {
    return resultFrom(
      fetch(`${config.rendererEndpoint}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      }),
      ErrorCode.ServiceUnavailable,
      (error) => `Renderer service request failed: ${String(error)}`
    ).andThen((response) => {
      if (!response.ok) {
        return errAsync(
          createError(
            ErrorCode.ServiceUnavailable,
            `Renderer service returned ${response.status}: ${response.statusText}`
          )
        );
      }

      return resultFrom(
        response.json() as Promise<{
          html: string;
          renderTime: number;
          success: boolean;
          error?: string;
        }>,
        ErrorCode.ServiceUnavailable,
        (error) => `Failed to parse renderer response: ${String(error)}`
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
    });
  }
}

export const rendererClient = new RendererClient();
