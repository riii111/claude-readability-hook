import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { type Result, type ResultAsync, fromThrowable, okAsync } from 'neverthrow';

export interface ReadabilityResult {
  title: string;
  text: string;
  success: boolean;
}

export class ReadabilityExtractor {
  extract(html: string, url?: string): ResultAsync<ReadabilityResult, string> {
    return okAsync(html).andThen((htmlContent) => this.parseWithReadability(htmlContent, url));
  }

  private parseWithReadability(html: string, url?: string): Result<ReadabilityResult, string> {
    const safeParse = fromThrowable(
      () => {
        const dom = new JSDOM(html, {
          // Use a harmless default; we only need a base URL for Readability's relative link resolution
          url: url ?? 'about:blank',
        });

        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article) {
          throw new Error('Failed to parse article with Readability');
        }

        const title = (article.title ?? '').trim();
        const text = (article.textContent ?? '').trim();

        return {
          title,
          text,
          success: true,
        };
      },
      (error) =>
        `Readability extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );

    return safeParse();
  }
}

// Singleton instance
export const readabilityExtractor = new ReadabilityExtractor();
