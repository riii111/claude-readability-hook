import { ResultAsync } from 'neverthrow';
import { type RequestInit, fetch as undiciFetch } from 'undici';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
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
      createError(ErrorCode.ServiceUnavailable, `Extractor service error: ${error}`)
    );
  }

  private callExtractorService(
    request: ExtractorRequest
  ): ResultAsync<ExtractorServiceResponse, string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const makeRequest = (): Promise<ExtractorServiceResponse> => {
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      };

      return extractorFetch(`${this.endpoint}/extract`, requestOptions)
        .then((res) => {
          if (!res.ok) {
            return Promise.reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
          }
          return res.json() as Promise<ExtractorServiceResponse>;
        })
        .finally(() => clearTimeout(timeoutId));
    };

    return ResultAsync.fromPromise(makeRequest(), (error) =>
      error instanceof Error ? error.message : String(error)
    );
  }
}

let extractorFetch: typeof undiciFetch = undiciFetch;

export function setExtractorFetch(fn: typeof undiciFetch) {
  extractorFetch = fn;
}
