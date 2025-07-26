import { createServer } from './server.js';
import { config } from './lib/config.js';

const server = createServer();

const start = async () => {
  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info(`Gateway service listening on port ${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  server.log.info('SIGTERM received, shutting down gracefully');
  await server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  server.log.info('SIGINT received, shutting down gracefully');
  await server.close();
  process.exit(0);
});

start();
