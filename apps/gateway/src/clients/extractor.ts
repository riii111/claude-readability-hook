import { ResultAsync } from 'neverthrow';
import { type RequestInit, fetch } from 'undici';
import { type GatewayError, createError } from '../core/errors.js';
import type { ExtractorServiceResponse } from '../core/types.js';
import { config } from '../lib/config.js';

export interface ExtractorRequest {
  html: string;
  url: string;
}

export class ExtractorClient {
  private readonly endpoint: string;
  private readonly timeout: number;

  constructor() {
    this.endpoint = config.extractorEndpoint;
    this.timeout = config.fetchTimeoutMs;
  }

  extractContent(request: ExtractorRequest): ResultAsync<ExtractorServiceResponse, GatewayError> {
    return this.callExtractorService(request).mapErr((error) =>
      createError('ServiceUnavailable', `Extractor service error: ${error}`)
    );
  }

  private callExtractorService(
    request: ExtractorRequest
  ): ResultAsync<ExtractorServiceResponse, string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const makeRequest = async (): Promise<ExtractorServiceResponse> => {
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      };

      const response = await fetch(`${this.endpoint}/extract`, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as ExtractorServiceResponse;
    };

    return ResultAsync.fromPromise(makeRequest(), (error) =>
      error instanceof Error ? error.message : String(error)
    ).andTee(() => {
      clearTimeout(timeoutId);
    });
  }
}
