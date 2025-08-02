import { ResultAsync } from 'neverthrow';

import { config } from './lib/config.js';
import { updateExternalServiceHealth } from './lib/metrics.js';
import { createServer } from './server.js';

let server: Awaited<ReturnType<typeof createServer>> | null = null;
let isShuttingDown = false;

const start = async () => {
  const serverResult = await ResultAsync.fromPromise(
    createServer(),
    (error) => `Failed to create server: ${error}`
  );

  const startResult = await serverResult.asyncAndThen((createdServer) => {
    server = createdServer;
    return ResultAsync.fromPromise(
      server.listen({ port: config.port, host: '0.0.0.0' }),
      (error) => `Failed to start server: ${error}`
    );
  });

  startResult.match(
    () => {
      if (server) {
        server.log.info(`Gateway service listening on port ${config.port}`);

        // Initialize external service health metrics with NaN (unknown state)
        updateExternalServiceHealth('extractor', Number.NaN);
        updateExternalServiceHealth('renderer', Number.NaN);
      }
    },
    async (error) => {
      process.stderr.write(`${error}\n`);

      process.exit(1);
    }
  );
};

const createShutdownHandler = (signal: string) => async () => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (!server) {
    process.stderr.write('Server not initialized, exiting\n');
    process.exit(1);
  }

  const safeServer = server; // TypeScript assertion after null check
  safeServer.log.info(`${signal} received, shutting down gracefully`);



  await ResultAsync.fromPromise(
    safeServer.close(),
    (error) => `Failed to close server on ${signal}: ${error}`
  ).match(
    () => {
      safeServer.log.info('Server closed successfully');
      process.exit(0);
    },
    (error) => {
      safeServer.log.error(error);
      process.exit(1);
    }
  );
};

process.once('SIGTERM', createShutdownHandler('SIGTERM'));
process.once('SIGINT', createShutdownHandler('SIGINT'));

start();
