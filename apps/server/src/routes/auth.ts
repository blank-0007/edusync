import type { FastifyInstance } from 'fastify';
import type { LoginResponse } from '@edusync/protocol';
import { z } from 'zod';
import { encodeDevToken, requireUser } from '../auth';
import { httpError, parseInput } from '../errors';
import { getUser, userToWire } from '../repos';
import type { SyncContext } from '../sync';

const loginSchema = z.object({
  userId: z.string().min(1),
  deviceId: z.string().min(1),
  platform: z.string().min(1).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;

  app.post('/api/auth/login', async (request) => {
    const body = parseInput(loginSchema, request.body);
    const userRow = getUser(db, body.userId);
    if (!userRow) {
      throw httpError(404, 'user_not_found', `No user with id "${body.userId}".`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO devices (id, user_id, platform, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         platform = excluded.platform,
         last_seen_at = excluded.last_seen_at`,
    ).run(body.deviceId, userRow.id, body.platform ?? 'web', now, now);

    const response: LoginResponse = {
      user: userToWire(userRow),
      token: encodeDevToken({ userId: userRow.id, deviceId: body.deviceId }),
      serverTime: now,
    };
    return response;
  });

  app.get('/api/me', { preHandler: requireUser(db) }, async (request) => ({
    user: request.auth!.user,
  }));
}
