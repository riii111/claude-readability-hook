import { type Result, ResultAsync, err, fromThrowable, ok } from 'neverthrow';
import { type RequestInit, fetch } from 'undici';
import { type ErrorCode, type GatewayError, createError } from '../core/errors.js';
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
    return ResultAsync.fromPromise(
      this.callExtractorService(request),
      (error) => createError('ServiceUnavailable', `Extractor service error: ${error}`)
    );
  }

  private async callExtractorService(request: ExtractorRequest): Promise<ExtractorServiceResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
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

      const data = (await response.json()) as ExtractorServiceResponse;
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}