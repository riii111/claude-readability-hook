import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/health", async (request, reply) => {
  return { status: "healthy", service: "renderer" };
});

fastify.post("/render", async (request, reply) => {
  // TODO: Implement Playwright rendering
  return {
    html: "<html><body>Placeholder - Renderer not implemented yet</body></html>",
    success: false,
    renderTime: 0,
    error: "Renderer service not implemented yet",
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Renderer service listening on port 3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
