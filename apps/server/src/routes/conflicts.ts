import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth';
import { parseInput } from '../errors';
import { conflictToWire, listConflictRows } from '../repos';
import { resolveConflict, type SyncContext } from '../sync';

const idParamsSchema = z.object({ id: z.string().min(1) });

const resolveBodySchema = z.object({
  resolution: z.enum(['mine', 'theirs']),
  note: z.string().max(2000).optional(),
});

/** Review Inbox: list frozen conflicts and record a human resolution. */
export function registerConflictRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;
  const auth = requireUser(db);

  app.get('/api/conflicts', { preHandler: auth }, async (request) => ({
    conflicts: listConflictRows(db, request.auth!.userId).map(conflictToWire),
  }));

  app.post('/api/conflicts/:id/resolve', { preHandler: auth }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params, 'Route params');
    const body = parseInput(resolveBodySchema, request.body);
    return resolveConflict(ctx, request.auth!.userId, id, body);
  });
}
