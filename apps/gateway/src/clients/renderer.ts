import { ResultAsync } from 'neverthrow';
import { type RequestInit, fetch } from 'undici';
import { type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';

export interface RenderRequest {
  url: string;
}

export interface RenderResponse {
  html: string;
  success: boolean;
  renderTime: number;
  error?: string;
}

export class RendererClient {
  private readonly endpoint: string;
  private readonly timeout: number;

  constructor() {
    this.endpoint = config.rendererEndpoint;
    this.timeout = config.fetchTimeoutMs;
  }

  render(request: RenderRequest): ResultAsync<RenderResponse, GatewayError> {
    return this.callRendererService(request).mapErr((error) =>
      createError('ServiceUnavailable', `Renderer service error: ${error}`)
    );
  }

  private callRendererService(request: RenderRequest): ResultAsync<RenderResponse, string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const makeRequest = (): Promise<RenderResponse> => {
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      };

      return fetch(`${this.endpoint}/render`, requestOptions)
        .then((res) => {
          if (!res.ok) {
            return Promise.reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
          }
          return res.json() as Promise<RenderResponse>;
        })
        .finally(() => clearTimeout(timeoutId));
    };

    return ResultAsync.fromPromise(makeRequest(), (error) =>
      error instanceof Error ? error.message : String(error)
    );
  }
}
