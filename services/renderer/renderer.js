import Fastify from "fastify";
import { chromium } from "playwright";
import pLimit from "p-limit";

const fastify = Fastify({ 
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

let browser = null;
let sharedContext = null;
const renderLimit = pLimit(parseInt(process.env.RENDERER_CONCURRENCY || '3', 10));
async function initializeBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    sharedContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    fastify.log.info('Browser and shared context initialized successfully');
  }
  return { browser, sharedContext };
}

async function closeBrowser() {
  if (sharedContext) {
    await sharedContext.close().catch(() => {});
    sharedContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
    fastify.log.info('Browser closed successfully');
  }
}


const MAX_RENDER_TIME_MS = parseInt(process.env.MAX_RENDER_TIME_MS || '30000', 10);
const MIN_WAIT_TIME_MS = 1000;
const MAX_SPA_WAIT_TIME_MS = 2000;
const SPA_CHECK_INTERVAL_MS = 100;

const TRACKING_PATTERNS = [
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

const CRITICAL_STYLESHEET_PATTERNS = [/inline/i, /critical/i, /above-fold/i];

const isTrackingRequest = (url) => TRACKING_PATTERNS.some(pattern => pattern.test(url));
const isCriticalStylesheet = (url) => CRITICAL_STYLESHEET_PATTERNS.some(pattern => pattern.test(url));


fastify.get("/health", {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          service: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  return { status: "healthy", service: "renderer" };
});


fastify.post("/render", {
  schema: {
    body: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          html: { type: 'string' },
          renderTime: { type: 'number' },
          success: { type: 'boolean' }
        }
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          renderTime: { type: 'number' }
        }
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          renderTime: { type: 'number' }
        }
      },
      504: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          renderTime: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  return renderLimit(async () => {
    const startTime = Date.now();
    
    try {
      const { url } = request.body;
      
      const { sharedContext: context } = await initializeBrowser();

    let page;
    let html;
    
    try {
      page = await context.newPage();
      
      await page.route('**/*', (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const requestUrl = request.url();

        if (['image', 'media', 'font'].includes(resourceType)) {
          return route.abort();
        }

        if (resourceType === 'stylesheet' && !isCriticalStylesheet(requestUrl)) {
          return route.abort();
        }

        if ((resourceType === 'xhr' || resourceType === 'fetch') && isTrackingRequest(requestUrl)) {
          return route.abort();
        }

        return route.continue();
      });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: MAX_RENDER_TIME_MS,
      });
      await waitForReady(page);
      html = await page.content();
      
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }

    const renderTime = Date.now() - startTime;
    
    return {
      html,
      renderTime,
      success: true
    };

    } catch (error) {
      const renderTime = Date.now() - startTime;
      
      const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout');
      const statusCode = isTimeout ? 504 : 500;
      
      fastify.log.error({
        error: error.message,
        stack: error.stack,
        renderTime,
        isTimeout
      }, 'Rendering failed');
      
      return reply.code(statusCode).send({
        success: false,
        error: error.message,
        renderTime
      });
    }
  });
});

async function waitForReady(page) {
  await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', () => resolve());
      }
    });
  });

  await Promise.race([
    page.waitForTimeout(MIN_WAIT_TIME_MS),
    page.evaluate(() => {
      return new Promise((resolve) => {
        const checkReady = () => {
          const hasReactRoot = document.querySelector('[data-reactroot]') !== null;
          const hasVueApp = window.__VUE__ !== undefined;
          const hasAngularApp = window.ng !== undefined;

          if (hasReactRoot || hasVueApp || hasAngularApp) {
            clearInterval(interval);
            resolve();
          }
        };

        checkReady();
        const interval = setInterval(checkReady, SPA_CHECK_INTERVAL_MS);

        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, MAX_SPA_WAIT_TIME_MS);
      });
    }),
  ]);
}


const gracefulShutdown = async (signal) => {
  fastify.log.info(`${signal} received, shutting down gracefully`);
  
  try {
    await closeBrowser();
    await fastify.close();
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, 'Error during shutdown');
    process.exit(1);
  }
};


['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});


const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    fastify.log.info("Renderer service listening on port 3000");
    await initializeBrowser();
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
