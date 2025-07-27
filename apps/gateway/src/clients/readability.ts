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
          url: url || 'https://example.com',
        });

        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article) {
          throw new Error('Failed to parse article with Readability');
        }

        return {
          title: article.title || '',
          text: article.textContent || '',
          success: true,
        };
      },
      (error) =>
        `Readability extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );

    return safeParse();
  }
}
