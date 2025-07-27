import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type Browser, type Page, type Route, chromium } from 'playwright';
import { type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';

export interface RenderResult {
  html: string;
  renderTime: number;
  success: boolean;
}

export class PlaywrightRenderer {
  private browser: Browser | undefined;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  render(url: string): ResultAsync<RenderResult, GatewayError> {
    return this.performRender(url);
  }

  private performRender(url: string): ResultAsync<RenderResult, GatewayError> {
    const startTime = Date.now();

    return ResultAsync.fromPromise(this.initialize(), (error) =>
      createError('InternalError', `Browser initialization failed: ${String(error)}`)
    )
      .andThen(() => {
        if (!this.browser) {
          return errAsync(createError('InternalError', 'Browser initialization failed'));
        }
        return okAsync(this.browser);
      })
      .andThen((browser: Browser) =>
        ResultAsync.fromPromise(
          browser.newPage({
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }),
          (error) => createError('InternalError', `Failed to create page: ${String(error)}`)
        )
      )
      .andThen((page: Page) =>
        ResultAsync.fromPromise(this.setupResourceBlocking(page), (error) =>
          createError('InternalError', `Failed to setup resource blocking: ${String(error)}`)
        )
          .andThen(() => okAsync(page))
          .andThen((page: Page) =>
            ResultAsync.fromPromise(
              page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: config.fetchTimeoutMs,
              }),
              (error) => createError('InternalError', `Failed to navigate: ${String(error)}`)
            ).andThen(() => okAsync(page))
          )
          .andThen((page: Page) =>
            ResultAsync.fromPromise(page.waitForTimeout(1000), (error) =>
              createError('InternalError', `Wait timeout failed: ${String(error)}`)
            ).andThen(() => okAsync(page))
          )
          .andThen((page: Page) =>
            ResultAsync.fromPromise(page.content(), (error) =>
              createError('InternalError', `Failed to get content: ${String(error)}`)
            ).map((html) => ({
              html,
              renderTime: Date.now() - startTime,
              success: true,
            }))
          )
          .andTee(() =>
            ResultAsync.fromPromise(page.close(), () => {
              // Page close errors are non-critical
            })
          )
      );
  }

  private async setupResourceBlocking(page: Page): Promise<void> {
    // Block images, CSS, fonts, and videos to focus on content extraction
    await page.route('**/*', (route: Route) => {
      const resourceType = route.request().resourceType();

      if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
        return route.abort();
      }

      return route.continue();
    });
  }
}

// Singleton instance
export const playwrightRenderer = new PlaywrightRenderer();
