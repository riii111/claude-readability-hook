import Fastify from "fastify";
import { chromium } from "playwright";
import pLimit from "p-limit";

const fastify = Fastify({ 
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  disableRequestLogging: true,
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

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/
];

const isPrivateIP = (ip) => PRIVATE_IP_RANGES.some(range => range.test(ip));

const validateUrlSecurity = (url) => {
  try {
    const urlObj = new URL(url);
    
    // Basic IP check
    if (isPrivateIP(urlObj.hostname)) {
      throw new Error(`Private IP access denied: ${urlObj.hostname}`);
    }
    
    return true;
  } catch (error) {
    throw new Error(`URL validation failed: ${error.message}`);
  }
};


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
}, async () => {
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
          success: { type: 'boolean' },
          blockedResourceCount: { type: 'number' }
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
  try {
    const { url } = request.body;
    
    // Validate URL security as second line of defense
    validateUrlSecurity(url);
    
    const result = await Promise.race([
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Render timeout exceeded')), MAX_RENDER_TIME_MS)
      ),
      renderLimit(async () => {
        const startTime = Date.now();
        
        const { sharedContext: context } = await initializeBrowser();

        let page;
        let html;
        let blockedResourceCount = 0;
        
        try {
          page = await context.newPage();
          
          await page.route('**/*', (route) => {
            const routeRequest = route.request();
            const resourceType = routeRequest.resourceType();
            const requestUrl = routeRequest.url();

            // Block images, media, and fonts
            if (['image', 'media', 'font'].includes(resourceType)) {
              blockedResourceCount++;
              return route.abort();
            }

            // Block additional font files by URL pattern
            if (resourceType === 'other' && /\.(woff2?|eot|ttf)$/i.test(requestUrl)) {
              blockedResourceCount++;
              return route.abort();
            }

            // Block iframe advertisements
            if (resourceType === 'document' && route.request().frame().parentFrame() !== null) {
              blockedResourceCount++;
              return route.abort();
            }

            if (resourceType === 'stylesheet' && !isCriticalStylesheet(requestUrl)) {
              blockedResourceCount++;
              return route.abort();
            }

            if ((resourceType === 'xhr' || resourceType === 'fetch') && isTrackingRequest(requestUrl)) {
              blockedResourceCount++;
              return route.abort();
            }

            return route.continue();
          });

          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: MAX_RENDER_TIME_MS,
          });
          await page.waitForTimeout(1000);
          html = await page.content();
          
          const renderTime = Date.now() - startTime;
          
          fastify.log.info({
            renderTime,
            blockedResourceCount,
            url
          }, 'Rendering completed successfully');
          
          return {
            html,
            renderTime,
            success: true,
            blockedResourceCount
          };
          
        } catch (error) {
          const renderTime = Date.now() - startTime;
          
          fastify.log.error({
            error: error.message,
            stack: error.stack,
            renderTime,
            blockedResourceCount
          }, 'Rendering failed');
          
          return {
            success: false,
            error: error.message,
            renderTime
          };
          
        } finally {
          if (page) {
            await page.context().clearCookies().catch(() => {});
            await page.close().catch(() => {});
          }
        }
      })
    ]);
  
    // Handle result and set appropriate status codes
    if (result.success) {
      return reply.send(result);
    } else {
      const isTimeout = result.error?.includes('timeout') || result.error?.includes('TimeoutError');
      const statusCode = isTimeout ? 504 : 500;
      return reply.code(statusCode).send(result);
    }
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout');
    const statusCode = isTimeout ? 504 : 500;
    return reply.code(statusCode).send({
      success: false,
      error: error.message
    });
  }
});


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
