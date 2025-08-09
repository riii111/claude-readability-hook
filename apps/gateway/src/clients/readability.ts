import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import type { ReadabilityResult } from '../core/types.js';
import { CodeBlockPreserver } from '../lib/extraction/code-block-preserver.js';
import { resultFrom } from '../lib/result.js';

class ReadabilityExtractor {
  extract(html: string, baseUrl?: string): ResultAsync<ReadabilityResult, GatewayError> {
    return this.performExtraction(html, baseUrl);
  }

  private performExtraction(
    html: string,
    baseUrl?: string
  ): ResultAsync<ReadabilityResult, GatewayError> {
    const preserver = new CodeBlockPreserver();

    return resultFrom(
      Promise.resolve().then(() => {
        const processedHtml = preserver.extractFromHtml(html);
        const dom = new JSDOM(processedHtml, { url: baseUrl || 'about:blank' });
        const reader = new Readability(dom.window.document);
        return reader.parse();
      }),
      ErrorCode.InternalError,
      (error) => `Readability processing failed: ${String(error)}`
    ).andThen((article) => {
      if (article?.textContent && article.title) {
        const restoredText = preserver.restoreInText(article.textContent);
        preserver.clear();

        return okAsync({
          title: article.title.trim(),
          text: restoredText,
          success: true,
        });
      }

      return errAsync(
        createError(ErrorCode.InternalError, 'Failed to parse content with Readability')
      );
    });
  }
}

export const readabilityExtractor = new ReadabilityExtractor();
