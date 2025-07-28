import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import type { ReadabilityResult } from '../core/types.js';
import { resultFrom } from '../lib/result.js';

export class ReadabilityExtractor {
  extract(html: string, baseUrl?: string): ResultAsync<ReadabilityResult, GatewayError> {
    return this.performExtraction(html, baseUrl);
  }

  private performExtraction(
    html: string,
    baseUrl?: string
  ): ResultAsync<ReadabilityResult, GatewayError> {
    return resultFrom(
      Promise.resolve().then(() => {
        const dom = new JSDOM(html, { url: baseUrl || 'about:blank' });
        const reader = new Readability(dom.window.document);
        return reader.parse();
      }),
      ErrorCode.InternalError,
      (error) => `JSDOM or Readability processing failed: ${String(error)}`
    ).andThen((article) => {
      if (article) {
        return okAsync({
          title: (article.title || '').trim(),
          text: (article.textContent || '').trim(),
          success: true,
        });
      }

      return errAsync(
        createError(ErrorCode.InternalError, 'Failed to parse content with Readability')
      );
    });
  }
}

// Singleton instance
export const readabilityExtractor = new ReadabilityExtractor();
