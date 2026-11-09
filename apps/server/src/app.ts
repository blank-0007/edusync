import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { HybridClock } from '@edusync/protocol';
import { ZodError } from 'zod';
import { parseDevToken } from './auth';
import { openDb } from './db';
import { joinDocRoom, leaveDocRoom } from './docs';
import { HttpError } from './errors';
import { getDocumentRow, getUser, userToWire } from './repos';
import { registerAuthRoutes } from './routes/auth';
import { registerCatalogRoutes } from './routes/catalog';
import { registerConflictRoutes } from './routes/conflicts';
import { registerDocRoutes } from './routes/docs';
import { registerHealthRoutes } from './routes/health';
import { registerSubmissionRoutes } from './routes/submissions';
import { registerSyncRoutes } from './routes/sync';
import { seed } from './seed';
import type { SyncContext } from './sync';

export interface BuildAppOptions {
  /** SQLite file path (or `:memory:`). Defaults to EDU_DB_PATH, then apps/server/data/edusync.db. */
  dbPath?: string;
  logger?: FastifyServerOptions['logger'];
  /** Seed the catalog on boot (default true; tests may pass false for a blank slate). */
  seedCatalog?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync;
    clock: HybridClock;
  }
}

/**
 * Build the EduSync HTTP API. Returns a Fastify instance that is ready to `inject` or
 * `listen` on; the caller owns its lifetime (`app.close()` closes the database too).
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const dbPath = options.dbPath ?? process.env.EDU_DB_PATH;
  const db = openDb(dbPath);
  if (options.seedCatalog !== false) seed(db);

  const clock = new HybridClock('srv');
  const ctx: SyncContext = { db, clock };

  const app = Fastify({ logger: options.logger ?? false });

  app.decorate('db', db);
  app.decorate('clock', clock);
  app.decorateRequest('auth', null);

  // Register WebSocket plugin
  app.register(fastifyWebsocket);

  // Simple sliding-window rate limiter on /api/sync/push to protect the reconciliation engine
  const pushTimestamps = new Map<string, number[]>();
  const PUSH_LIMIT = 500;
  const WINDOW_MS = 60_000;

  // One encapsulated plugin scope keeps CORS headers, error envelope and routes together.
  app.register(async (instance) => {
    await instance.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    });

    instance.addHook('onRequest', async (request, reply) => {
      if (request.url === '/api/sync/push' && request.method === 'POST') {
        const clientKey = request.ip || 'unknown';
        const now = Date.now();
        const timestamps = (pushTimestamps.get(clientKey) ?? []).filter((t) => now - t < WINDOW_MS);
        if (timestamps.length >= PUSH_LIMIT) {
          return reply.code(429).send({
            error: 'rate_limited',
            message: 'Too many sync push requests. Please retry shortly.',
          });
        }
        timestamps.push(now);
        pushTimestamps.set(clientKey, timestamps);
      }
    });

    registerHealthRoutes(instance, ctx);
    registerAuthRoutes(instance, ctx);
    registerCatalogRoutes(instance, ctx);
    registerSubmissionRoutes(instance, ctx);
    registerSyncRoutes(instance, ctx);
    registerConflictRoutes(instance, ctx);
    registerDocRoutes(instance, ctx);

    // WebSocket endpoint for collaborative document rooms
    instance.get('/ws', { websocket: true }, (socket, request) => {
      const query = request.query as Record<string, string | undefined>;
      const token = query.token;
      const docId = query.docId;

      if (!token) {
        socket.close(4401, 'Unauthorized');
        return;
      }
      const payload = parseDevToken(token);
      if (!payload) {
        socket.close(4401, 'Unauthorized');
        return;
      }
      const userRow = getUser(db, payload.userId);
      if (!userRow) {
        socket.close(4401, 'Unauthorized');
        return;
      }

      if (!docId) {
        socket.close(4404, 'Missing docId');
        return;
      }
      const docRow = getDocumentRow(db, docId);
      if (!docRow) {
        socket.close(4404, 'Document not found');
        return;
      }

      const sub = joinDocRoom(socket, docId, userToWire(userRow), payload.deviceId, db);

      socket.on('message', (_data) => {
        // ws is receive-only for updates; client may send ping or hello
      });

      socket.on('close', () => {
        leaveDocRoom(sub);
      });
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'not_found',
      message: `No route for ${request.method} ${request.url}.`,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Request failed validation.',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: error.code || 'bad_request',
        message: error.message,
      });
    }
    request.log.error({ err: error }, 'unhandled request error');
    return reply.code(500).send({
      error: 'internal_error',
      message: 'Unexpected server error.',
    });
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
