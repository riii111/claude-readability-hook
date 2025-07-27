import { ResultAsync, errAsync } from 'neverthrow';
import { type GatewayError, createError } from '../core/errors.js';
import type { ExtractorServiceResponse } from '../core/types.js';
import { config } from '../lib/config.js';

export interface ExtractorRequest {
  html: string;
  url: string;
}

export class ExtractorClient {
  extractContent(html: string, url: string): ResultAsync<ExtractorServiceResponse, GatewayError> {
    return this.performExtraction(html, url);
  }

  private performExtraction(
    html: string,
    url: string
  ): ResultAsync<ExtractorServiceResponse, GatewayError> {
    return ResultAsync.fromPromise(
      fetch(`${config.extractorEndpoint}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html, url } satisfies ExtractorRequest),
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      }),
      (error) =>
        createError(
          'ServiceUnavailable',
          `Failed to connect to extractor service: ${String(error)}`
        )
    ).andThen((response: Response) => {
      if (!response.ok) {
        return errAsync(
          createError(
            'ServiceUnavailable',
            `Extractor service responded with ${response.status}: ${response.statusText}`
          )
        );
      }
      return ResultAsync.fromPromise(
        response.json() as Promise<ExtractorServiceResponse>,
        (error) =>
          createError('ServiceUnavailable', `Failed to parse extractor response: ${String(error)}`)
      );
    });
  }
}

// Singleton instance
export const extractorClient = new ExtractorClient();
