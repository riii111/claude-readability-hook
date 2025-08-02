import Fastify from "fastify";
import { chromium } from "playwright";

const fastify = Fastify({ 
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

let browser = null;
async function initializeBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    fastify.log.info('Browser initialized successfully');
  }
  return browser;
}

async function closeBrowser() {
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


fastify.get("/health", async (request, reply) => {
  return { status: "healthy", service: "renderer" };
});


fastify.post("/render", async (request, reply) => {
  const startTime = Date.now();
  
  try {
    const { url } = request.body;
    
    if (!url || typeof url !== 'string') {
      return reply.code(400).send({
        success: false,
        error: "URL is required and must be a string",
        renderTime: Date.now() - startTime
      });
    }

    const browserInstance = await initializeBrowser();
    const context = await browserInstance.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    let page;
    let html;
    
    try {
      page = await context.newPage();
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
      await context.close().catch(() => {});
    }

    const renderTime = Date.now() - startTime;
    
    return {
      html,
      renderTime,
      success: true
    };

  } catch (error) {
    const renderTime = Date.now() - startTime;
    
    fastify.log.error({
      error: error.message,
      stack: error.stack,
      renderTime
    }, 'Rendering failed');
    
    return reply.code(500).send({
      success: false,
      error: error.message,
      renderTime
    });
  }
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
