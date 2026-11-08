import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@edusync/protocol';
import { getUser, userToWire } from './repos';

/**
 * Dev-grade bearer auth (docs/CONTRACT.md):
 *
 *   token = "dev." + base64url(JSON.stringify({ userId, deviceId }))
 *
 * There is no password: the login route validates the user, upserts the device row and
 * mints the token. Every other route requires `Authorization: Bearer dev.<...>`.
 */

export const DEV_TOKEN_PREFIX = 'dev.';

export interface DevTokenPayload {
  userId: string;
  deviceId: string;
}

export interface AuthContext {
  user: User;
  userId: string;
  deviceId: string;
}

export function encodeDevToken(payload: DevTokenPayload): string {
  const json = JSON.stringify({ userId: payload.userId, deviceId: payload.deviceId });
  return `${DEV_TOKEN_PREFIX}${Buffer.from(json, 'utf8').toString('base64url')}`;
}

export function parseDevToken(token: string): DevTokenPayload | null {
  if (!token.startsWith(DEV_TOKEN_PREFIX)) return null;
  try {
    const decoded = Buffer.from(token.slice(DEV_TOKEN_PREFIX.length), 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const userId = record.userId;
    const deviceId = record.deviceId;
    if (typeof userId !== 'string' || userId.length === 0) return null;
    if (typeof deviceId !== 'string' || deviceId.length === 0) return null;
    return { userId, deviceId };
  } catch {
    return null;
  }
}

export function extractBearerToken(header: string | string[] | undefined): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw.trim());
  return match ? match[1] : null;
}

/** Resolve the request's bearer token to a user context (null when unauthenticated). */
export function authenticate(db: DatabaseSync, request: FastifyRequest): AuthContext | null {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) return null;
  const payload = parseDevToken(token);
  if (!payload) return null;
  const row = getUser(db, payload.userId);
  if (!row) return null;
  return { user: userToWire(row), userId: row.id, deviceId: payload.deviceId };
}

/** Fastify preHandler factory: attaches `request.auth` or replies 401. */
export function requireUser(db: DatabaseSync) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = authenticate(db, request);
    if (!auth) {
      await reply.code(401).send({
        error: 'unauthorized',
        message:
          'Missing or invalid bearer token. Send "Authorization: Bearer dev.<base64url({userId,deviceId})>" obtained from POST /api/auth/login.',
      });
      return;
    }
    request.auth = auth;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
