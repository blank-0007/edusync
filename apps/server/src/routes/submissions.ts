import type { FastifyInstance } from 'fastify';
import type { SubmissionsResponse } from '@edusync/protocol';
import { z } from 'zod';
import { requireUser } from '../auth';
import { transaction } from '../db';
import { httpError, parseInput } from '../errors';
import { listSubmissionRows, submissionToWire } from '../repos';
import { submitOnce, type SyncContext } from '../sync';

const submitBodySchema = z.object({
  assignmentId: z.string().min(1),
  submissionId: z.string().min(1),
  contentHash: z.string().min(1),
  body: z.string(),
  clientSubmittedAt: z.string().min(1),
});

export function registerSubmissionRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;
  const auth = requireUser(db);

  app.get('/api/submissions/mine', { preHandler: auth }, async (request) => ({
    submissions: listSubmissionRows(db, request.auth!.userId).map(submissionToWire),
  }));

  /**
   * Exactly-once submit: 200 { submission, deduped } for the first and every replay of the
   * same submissionId; 409 already_submitted when a *different* submissionId already exists
   * for this student+assignment (both versions are frozen in the conflicts ledger).
   */
  app.post('/api/submissions', { preHandler: auth }, async (request, reply) => {
    const payload = parseInput(submitBodySchema, request.body);
    const actor = { userId: request.auth!.userId, deviceId: request.auth!.deviceId };
    const outcome = transaction(db, () => submitOnce(ctx, actor, payload));

    switch (outcome.kind) {
      case 'rejected':
        if (outcome.reason === 'unknown_assignment') {
          throw httpError(404, 'assignment_not_found', `No assignment with id "${payload.assignmentId}".`);
        }
        throw httpError(422, outcome.reason, 'The submission could not be accepted.');
      case 'conflict':
        return reply.code(409).send({
          error: 'already_submitted',
          message: `A submission already exists for this assignment (${outcome.existing.submissionId}); this attempt was not recorded.`,
          existing: outcome.existing,
          conflictId: outcome.conflictId,
        });
      default: {
        const response: SubmissionsResponse = {
          submission: outcome.submission,
          deduped: outcome.kind === 'duplicate',
        };
        return response;
      }
    }
  });
}
