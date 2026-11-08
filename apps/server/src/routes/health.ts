import type { FastifyInstance } from 'fastify';
import type { SyncContext } from '../sync';

/** Unauthenticated liveness probe: `{ ok, time, serverHlc }`. */
export function registerHealthRoutes(app: FastifyInstance, ctx: SyncContext): void {
  app.get('/api/health', async () => ({
    ok: true,
    time: new Date().toISOString(),
    serverHlc: ctx.clock.now(),
  }));
}
