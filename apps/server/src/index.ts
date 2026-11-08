import { buildApp } from './app';

const HOST = '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '8787', 10);

const app = buildApp({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

async function main(): Promise<void> {
  await app.listen({ port, host: HOST });
  app.log.info(`EduSync server listening at http://${HOST}:${port} (health: GET /api/health)`);
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`received ${signal}; shutting down`);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
