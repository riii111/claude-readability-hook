import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ResultAsync } from 'neverthrow';
import { type GatewayError, createError } from '../core/errors.js';
import type { ReadabilityResult } from '../core/types.js';

export class ReadabilityExtractor {
  extract(html: string): ResultAsync<ReadabilityResult, GatewayError> {
    return ResultAsync.fromPromise(this.performExtraction(html), (error) =>
      createError('InternalError', `Readability extraction failed: ${String(error)}`)
    );
  }

  private async performExtraction(html: string): Promise<ReadabilityResult> {
    const dom = new JSDOM(html, { url: 'https://example.com' });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      return {
        title: article.title || '',
        text: article.textContent || '',
        success: true,
      };
    }

    return Promise.reject(new Error('Failed to parse content with Readability'));
  }
}

// Singleton instance
export const readabilityExtractor = new ReadabilityExtractor();
