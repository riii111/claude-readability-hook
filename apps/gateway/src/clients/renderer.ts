import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import pLimit from 'p-limit';
import { type Browser, type BrowserContext, type Page, type Route, chromium } from 'playwright';
import { type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';
import { fromPromiseE } from '../lib/result.js';

export interface RenderResult {
  html: string;
  renderTime: number;
}

export class PlaywrightRenderer {
  private browser: Browser | undefined;
  private limit = pLimit(5); // Allow max 5 concurrent renders

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
    return fromPromiseE(
      this.limit(async () => {
        const result = await this.performRenderInternal(url);
        return result.match(
          (success) => success,
          (error) => {
            throw error;
          }
        );
      }),
      'InternalError',
      (error) => `Render operation failed: ${String(error)}`
    );
  }

  private performRenderInternal(url: string): ResultAsync<RenderResult, GatewayError> {
    const startTime = Date.now();

    return fromPromiseE(
      this.initialize(),
      'InternalError',
      (error) => `Browser initialization failed: ${String(error)}`
    )
      .andThen(() => {
        if (!this.browser) {
          return errAsync(createError('InternalError', 'Browser initialization failed'));
        }
        return okAsync(this.browser);
      })
      .andThen((browser: Browser) =>
        fromPromiseE(
          browser.newContext({
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }),
          'InternalError',
          (error) => `Failed to create context: ${String(error)}`
        )
      )
      .andThen((context: BrowserContext) =>
        fromPromiseE(
          context.newPage(),
          'InternalError',
          (error) => `Failed to create page: ${String(error)}`
        )
          .andThen((page: Page) =>
            fromPromiseE(
              this.setupResourceBlocking(page),
              'InternalError',
              (error) => `Failed to setup resource blocking: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: config.fetchTimeoutMs,
              }),
              'InternalError',
              (error) => `Failed to navigate: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              Promise.race([
                page.waitForLoadState('networkidle', { timeout: 2000 }),
                page.waitForTimeout(1000),
              ]),
              'InternalError',
              (error) => `Wait timeout failed: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              page.content(),
              'InternalError',
              (error) => `Failed to get content: ${String(error)}`
            ).map((html) => ({
              html,
              renderTime: Date.now() - startTime,
              context,
            }))
          )
          .andTee(({ context }) =>
            fromPromiseE(context.close(), 'InternalError', () => 'Context cleanup failed').orElse(
              () => okAsync(undefined)
            )
          )
          .map(({ html, renderTime }) => ({ html, renderTime }))
      );
  }

  private async setupResourceBlocking(page: Page): Promise<void> {
    await page.route('**/*', (route: Route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      if (['image', 'media', 'font'].includes(resourceType)) {
        return route.abort();
      }

      if (resourceType === 'stylesheet' && !this.isCriticalStylesheet(url)) {
        return route.abort();
      }

      if (resourceType === 'xhr' || resourceType === 'fetch') {
        return route.continue();
      }

      return route.continue();
    });
  }

  private isCriticalStylesheet(url: string): boolean {
    return url.includes('inline') || url.includes('critical') || url.includes('above-fold');
  }
}

// Singleton instance
export const playwrightRenderer = new PlaywrightRenderer();
