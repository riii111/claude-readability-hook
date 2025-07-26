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

const createShutdownHandler = (signal: string) => () => {
  server.log.info(`${signal} received, shutting down gracefully`);

  ResultAsync.fromPromise(
    server.close(),
    (error) => `Failed to close server on ${signal}: ${error}`
  ).match(
    () => {
      server.log.info('Server closed successfully');
      process.exit(0);
    },
    (error) => {
      server.log.error(error);
      process.exit(1);
    }
  );
};

process.on('SIGTERM', createShutdownHandler('SIGTERM'));
process.on('SIGINT', createShutdownHandler('SIGINT'));

start();
