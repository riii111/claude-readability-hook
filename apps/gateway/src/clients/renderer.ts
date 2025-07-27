import { type ResultAsync, errAsync, okAsync } from 'neverthrow';
import pLimit from 'p-limit';
import { type Browser, type BrowserContext, type Page, type Route, chromium } from 'playwright';
import { ErrorCode, type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';
import { fromPromiseE } from '../lib/result.js';

// Constants for DOM ready detection
const MIN_WAIT_TIME_MS = 1000;
const MAX_SPA_WAIT_TIME_MS = 2000;
const SPA_CHECK_INTERVAL_MS = 100;

export interface RenderResult {
  html: string;
  renderTime: number;
}

export class PlaywrightRenderer {
  private browser: Browser | undefined;
  private limit = pLimit(config.rendererConcurrency);

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
        if (result.isOk()) {
          return result.value;
        } else {
          return Promise.reject(result.error);
        }
      }),
      ErrorCode.InternalError,
      (error) => `Render operation failed: ${String(error)}`
    );
  }

  private performRenderInternal(url: string): ResultAsync<RenderResult, GatewayError> {
    const startTime = Date.now();

    return fromPromiseE(
      this.initialize(),
      ErrorCode.InternalError,
      (error) => `Browser initialization failed: ${String(error)}`
    )
      .andThen(() => {
        if (!this.browser) {
          return errAsync(createError(ErrorCode.InternalError, 'Browser initialization failed'));
        }
        return okAsync(this.browser);
      })
      .andThen((browser: Browser) =>
        fromPromiseE(
          browser.newContext({
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }),
          ErrorCode.InternalError,
          (error) => `Failed to create context: ${String(error)}`
        )
      )
      .andThen((context: BrowserContext) =>
        fromPromiseE(
          context.newPage(),
          ErrorCode.InternalError,
          (error) => `Failed to create page: ${String(error)}`
        )
          .andThen((page: Page) =>
            fromPromiseE(
              this.setupResourceBlocking(page),
              ErrorCode.InternalError,
              (error) => `Failed to setup resource blocking: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: config.fetchTimeoutMs,
              }),
              ErrorCode.InternalError,
              (error) => `Failed to navigate: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              this.waitForReady(page),
              ErrorCode.InternalError,
              (error) => `Wait for ready failed: ${String(error)}`
            ).andThen(() => okAsync({ page, context }))
          )
          .andThen(({ page, context }) =>
            fromPromiseE(
              page.content(),
              ErrorCode.InternalError,
              (error) => `Failed to get content: ${String(error)}`
            ).map((html) => ({
              html,
              renderTime: Date.now() - startTime,
              context,
            }))
          )
          .andTee(({ context }) =>
            fromPromiseE(
              context.close(),
              ErrorCode.InternalError,
              () => 'Context cleanup failed'
            ).orElse(() => okAsync(undefined))
          )
          .map(({ html, renderTime }) => ({ html, renderTime }))
      );
  }

  private async waitForReady(page: Page): Promise<void> {
    // Wait for DOM to be ready
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', () => resolve());
        }
      });
    });

    // Additional wait for dynamic content (with timeout)
    await Promise.race([
      page.waitForTimeout(MIN_WAIT_TIME_MS),
      page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // Check for common SPA framework ready indicators
          const checkReady = () => {
            const hasReactRoot = document.querySelector('[data-reactroot]') !== null;
            const hasVueApp = (window as { __VUE__?: unknown }).__VUE__ !== undefined;
            const hasAngularApp = (window as { ng?: unknown }).ng !== undefined;

            if (hasReactRoot || hasVueApp || hasAngularApp) {
              resolve();
            }
          };

          // Check immediately and periodically
          checkReady();
          const interval = setInterval(checkReady, SPA_CHECK_INTERVAL_MS);

          // Cleanup after max wait time
          setTimeout(() => {
            clearInterval(interval);
            resolve();
          }, MAX_SPA_WAIT_TIME_MS);
        });
      }),
    ]);
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
        // Block analytics and tracking requests
        if (this.isTrackingRequest(url)) {
          return route.abort();
        }
        return route.continue();
      }

      return route.continue();
    });
  }

  private isCriticalStylesheet(url: string): boolean {
    return url.includes('inline') || url.includes('critical') || url.includes('above-fold');
  }

  private isTrackingRequest(url: string): boolean {
    const trackingPatterns = [
      /\/analytics\//i,
      /\/gtag\//i,
      /\/ga\./i,
      /google-analytics\.com/i,
      /googletagmanager\.com/i,
      /facebook\.com\/tr/i,
      /\/pixel\//i,
      /\/beacon\//i,
      /\/collect\?/i,
      /\/track\//i,
      /\/event\//i,
      /matomo\./i,
      /piwik\./i,
      /hotjar\.com/i,
      /clarity\.ms/i,
      /segment\.io/i,
      /mixpanel\.com/i,
      /amplitude\.com/i,
    ];

    return trackingPatterns.some((pattern) => pattern.test(url));
  }
}

// Singleton instance
export const playwrightRenderer = new PlaywrightRenderer();
