import type { FastifyInstance } from 'fastify';
import type { OpResult, StateHashResponse, SyncPullResponse, SyncPushResponse } from '@edusync/protocol';
import { z } from 'zod';
import { requireUser } from '../auth';
import { parseInput } from '../errors';
import { lastSeq } from '../store';
import { applyOp, pullChanges, stateHash, type IncomingOp, type SyncContext } from '../sync';

const opSchema = z.object({
  opId: z.string().min(1),
  deviceId: z.string().min(1),
  hlc: z.string().min(1),
  entity: z.enum(['draft', 'lesson_progress', 'submission']),
  entityId: z.string().min(1),
  type: z.enum(['create', 'update', 'delete']).optional(),
  baseRev: z.number().int().min(0).optional(),
  payload: z.unknown(),
});

const pushBodySchema = z.object({
  ops: z.array(opSchema).min(1).max(200),
});

const pullBodySchema = z.object({
  sinceSeq: z.number().int().min(0).nullable().optional(),
});

/**
 * Ops are applied per entity in HLC order regardless of the order the client batched them
 * in. HLC strings are fixed-width, so plain lexicographic comparison is causal ordering;
 * deviceId and opId make the order total and deterministic when stamps coincide.
 */
function opOrderKey(op: IncomingOp): string {
  return [op.entity, op.entityId, op.hlc, op.deviceId, op.opId].join('\u0000');
}

export function registerSyncRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;
  const auth = requireUser(db);

  app.post('/api/sync/push', { preHandler: auth }, async (request) => {
    const body = parseInput(pushBodySchema, request.body);
    const actor = { userId: request.auth!.userId, deviceId: request.auth!.deviceId };
    const ops = body.ops as IncomingOp[];

    // Apply sorted; answer in the client's original order (results are matched by opId).
    const order = ops.map((op, index) => ({ op, index }));
    order.sort((a, b) => {
      const keyA = opOrderKey(a.op);
      const keyB = opOrderKey(b.op);
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });

    const byIndex = new Map<number, OpResult>();
    for (const { op, index } of order) {
      byIndex.set(index, applyOp(ctx, actor, op));
    }

    const response: SyncPushResponse = {
      results: ops.map((_op, index) => byIndex.get(index)!),
      serverHlc: ctx.clock.now(),
      seq: lastSeq(db, actor.userId),
    };
    return response;
  });

  app.post('/api/sync/pull', { preHandler: auth }, async (request) => {
    const body = parseInput(pullBodySchema, request.body ?? {});
    const response: SyncPullResponse = pullChanges(ctx, request.auth!.userId, body.sinceSeq ?? 0);
    return response;
  });

  app.get('/api/sync/state-hash', { preHandler: auth }, async (request) => {
    const response: StateHashResponse = stateHash(ctx, request.auth!.userId);
    return response;
  });
}
