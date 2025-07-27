import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type GatewayError, createError } from '../core/errors.js';
import type { ReadabilityResult } from '../core/types.js';
import { fromPromiseE } from '../lib/result.js';

export class ReadabilityExtractor {
  extract(html: string): ResultAsync<ReadabilityResult, GatewayError> {
    return this.performExtraction(html);
  }

  private performExtraction(html: string): ResultAsync<ReadabilityResult, GatewayError> {
    return fromPromiseE(
      Promise.resolve().then(() => {
        const dom = new JSDOM(html, { url: 'https://example.com' });
        const reader = new Readability(dom.window.document);
        return reader.parse();
      }),
      'InternalError',
      (error) => `JSDOM or Readability processing failed: ${String(error)}`
    ).andThen((article) => {
      if (article) {
        return okAsync({
          title: article.title || '',
          text: article.textContent || '',
          success: true,
        });
      }

      return errAsync(createError('InternalError', 'Failed to parse content with Readability'));
    });
  }
}

// Singleton instance
export const readabilityExtractor = new ReadabilityExtractor();
