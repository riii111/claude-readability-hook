import { chromium, type Browser, type Page } from 'playwright';
import { type ResultAsync, okAsync, errAsync } from 'neverthrow';
import { type GatewayError, createError } from '../core/errors.js';
import { config } from '../lib/config.js';

export interface RenderResult {
  html: string;
  renderTime: number;
  success: boolean;
}

export class PlaywrightRenderer {
  private browser?: Browser;

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
    return ResultAsync.fromPromise(this.performRender(url), (error) =>
      createError('InternalError', `Playwright rendering failed: ${String(error)}`)
    );
  }

  private async performRender(url: string): Promise<RenderResult> {
    const startTime = Date.now();
    
    await this.initialize();
    
    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }

    const page = await this.browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Block unnecessary resources to speed up rendering
    await this.setupResourceBlocking(page);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.fetchTimeoutMs,
      });

      // Wait a bit for dynamic content to load
      await page.waitForTimeout(1000);

      const html = await page.content();
      const renderTime = Date.now() - startTime;

      return {
        html,
        renderTime,
        success: true,
      };
    } finally {
      await page.close();
    }
  }

  private async setupResourceBlocking(page: Page): Promise<void> {
    // Block images, CSS, fonts, and videos to focus on content extraction
    await page.route('**/*', (route) => {
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