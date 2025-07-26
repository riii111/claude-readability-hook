import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => {
  return { status: 'healthy', service: 'gateway' };
});

fastify.post('/extract', async () => {
  return {
    title: 'Placeholder',
    text: 'Gateway service is running but extract functionality not implemented yet',
    success: false,
    cached: false,
    engine: 'none'
  };
});

const start = async () => {
  try {
    await fastify.listen({ port: 7777, host: '0.0.0.0' });
    console.log('Gateway service listening on port 7777');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
