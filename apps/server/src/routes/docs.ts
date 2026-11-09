import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth';
import { getDocSnapshot, listDocs } from '../docs';
import { httpError } from '../errors';
import type { SyncContext } from '../sync';

export function registerDocRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;
  const auth = requireUser(db);

  /** List all shared documents. */
  app.get('/api/docs', { preHandler: auth }, async () => {
    return { docs: listDocs(db) };
  });

  /** Get a document snapshot for catching up a local Y.Doc. */
  app.get<{ Params: { id: string } }>('/api/docs/:id', { preHandler: auth }, async (request) => {
    const { id } = request.params;
    const snapshot = getDocSnapshot(db, id);
    if (!snapshot) {
      throw httpError(404, 'document_not_found', `No document with id ${id}.`);
    }
    return snapshot;
  });
}
