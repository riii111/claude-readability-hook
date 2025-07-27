import { ResultAsync } from 'neverthrow';
import { playwrightRenderer } from './clients/renderer.js';
import { config } from './lib/config.js';
import { createServer } from './server.js';

let server: Awaited<ReturnType<typeof createServer>>;

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
      server.log.info(`Gateway service listening on port ${config.port}`);
    },
    (error) => {
      process.stderr.write(`${error}\n`);
      process.exit(1);
    }
  );
};

const createShutdownHandler = (signal: string) => async () => {
  if (!server) {
    process.stderr.write('Server not initialized, exiting\n');
    process.exit(1);
  }

  server.log.info(`${signal} received, shutting down gracefully`);

  const rendererCloseResult = await ResultAsync.fromPromise(
    playwrightRenderer.close(),
    (error) => `Renderer close failed: ${String(error)}`
  );

  rendererCloseResult.match(
    () => server.log.info('Renderer closed successfully'),
    (error) => server.log.warn(error)
  );

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

process.once('SIGTERM', createShutdownHandler('SIGTERM'));
process.once('SIGINT', createShutdownHandler('SIGINT'));

start();
