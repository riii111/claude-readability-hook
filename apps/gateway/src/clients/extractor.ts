import { type ResultAsync, errAsync } from 'neverthrow';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import type { ExtractorServiceResponse } from '../core/types.js';
import { config } from '../lib/config.js';
import { fromPromiseE } from '../lib/result.js';

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
    return fromPromiseE(
      fetch(`${config.extractorEndpoint}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html, url } satisfies ExtractorRequest),
        signal: AbortSignal.timeout(config.fetchTimeoutMs),
      }),
      ErrorCode.ServiceUnavailable,
      (error) => `Failed to connect to extractor service: ${String(error)}`
    ).andThen((response: Response) => {
      if (!response.ok) {
        return errAsync(
          createError(
            ErrorCode.ServiceUnavailable,
            `Extractor service responded with ${response.status}: ${response.statusText}`
          )
        );
      }
      return fromPromiseE(
        response.json() as Promise<ExtractorServiceResponse>,
        ErrorCode.ServiceUnavailable,
        (error) => `Failed to parse extractor response: ${String(error)}`
      );
    });
  }
}

// Singleton instance
export const extractorClient = new ExtractorClient();
