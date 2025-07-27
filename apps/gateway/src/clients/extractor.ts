import { type ResultAsync, okAsync, errAsync } from 'neverthrow';
import { type GatewayError, createError } from '../core/errors.js';
import type { ExtractorServiceResponse } from '../core/types.js';
import { config } from '../lib/config.js';

export interface ExtractorRequest {
  html: string;
  url: string;
}

export class ExtractorClient {
  extractContent(html: string, url: string): ResultAsync<ExtractorServiceResponse, GatewayError> {
    return ResultAsync.fromPromise(this.performExtraction(html, url), (error) =>
      createError('ServiceUnavailable', `Extractor service failed: ${String(error)}`)
    );
  }

  private async performExtraction(html: string, url: string): Promise<ExtractorServiceResponse> {
    const response = await fetch(`${config.extractorEndpoint}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ html, url } satisfies ExtractorRequest),
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Extractor service responded with ${response.status}: ${response.statusText}`);
    }

    return await response.json() as ExtractorServiceResponse;
  }
}

// Singleton instance
export const extractorClient = new ExtractorClient();