import { ResultAsync } from 'neverthrow';
import { config } from './lib/config.js';
import { createServer } from './server.js';

const server = createServer();

const start = async () => {
  const startResult = await ResultAsync.fromPromise(
    server.listen({ port: config.port, host: '0.0.0.0' }),
    (error) => `Failed to start server: ${error}`
  );

  startResult.match(
    () => {
      server.log.info(`Gateway service listening on port ${config.port}`);
    },
    (error) => {
      server.log.error(error);
      process.exit(1);
    }
  );
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
