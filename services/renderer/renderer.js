import Fastify from "fastify";
import { chromium } from "playwright";

const fastify = Fastify({ logger: true });

let browser = null;

const MAX_RENDER_TIME_MS = parseInt(process.env.MAX_RENDER_TIME_MS || "30000", 10);
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BLOCKED_RESOURCES = ["stylesheet", "font", "image", "media"];

async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
      ],
    }).catch(error => {
      console.error("Failed to initialize browser:", error);
      throw error;
    });
    console.log("Browser initialized");
  }
  return browser;
}

fastify.get("/health", async () => {
  const browserHealthy = browser !== null;
  return { 
    status: browserHealthy ? "healthy" : "unhealthy", 
    service: "renderer",
    browser: browserHealthy
  };
});

fastify.post("/render", async (request, reply) => {
  const startTime = Date.now();
  let page = null;

  const { url } = request.body;

  if (!url) {
    return reply.code(400).send({
      html: "",
      success: false,
      renderTime: 0,
      error: "URL is required",
    });
  }

  const browserInstance = await initBrowser().catch(error => {
    const renderTime = Date.now() - startTime;
    fastify.log.error("Browser init failed:", error);
    return reply.code(500).send({
      html: "",
      success: false,
      renderTime,
      error: error.message,
    });
  });

  if (!browserInstance) return;

  page = await browserInstance.newPage().catch(error => {
    const renderTime = Date.now() - startTime;
    fastify.log.error("Page creation failed:", error);
    return reply.code(500).send({
      html: "",
      success: false,
      renderTime,
      error: error.message,
    });
  });

  if (!page) return;

  await page.setUserAgent(USER_AGENT);

  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (BLOCKED_RESOURCES.includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const html = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: MAX_RENDER_TIME_MS,
  })
  .then(() => page.waitForTimeout(2000))
  .then(() => page.content())
  .catch(error => {
    const renderTime = Date.now() - startTime;
    fastify.log.error("Rendering failed:", error);
    return reply.code(500).send({
      html: "",
      success: false,
      renderTime,
      error: error.message,
    });
  })
  .finally(() => {
    if (page) {
      page.close().catch(closeError => {
        fastify.log.warn("Failed to close page:", closeError);
      });
    }
  });

  if (!html) return;

  const renderTime = Date.now() - startTime;
  return {
    html,
    success: true,
    renderTime,
  };
});

const gracefulShutdown = async () => {
  console.log("Shutting down renderer service...");
  if (browser) {
    await browser.close().catch(error => {
      console.error("Error closing browser:", error);
    });
    console.log("Browser closed");
  }
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

const start = async () => {
  await initBrowser();
  await fastify.listen({ port: 3000, host: "0.0.0.0" }).catch(err => {
    fastify.log.error(err);
    process.exit(1);
  });
  console.log("Renderer service listening on port 3000");
};

start();
