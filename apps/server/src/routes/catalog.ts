import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth';
import { httpError, parseInput } from '../errors';
import {
  assignmentToWire,
  getAssignmentRow,
  getCourse,
  getCourseRow,
  getLessonRow,
  getSubmissionForAssignment,
  lessonToWire,
  listAssignmentRows,
  listCourses,
  submissionToWire,
} from '../repos';
import type { SyncContext } from '../sync';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Catalog reads. Everything a device needs to become fully offline-capable. */
export function registerCatalogRoutes(app: FastifyInstance, ctx: SyncContext): void {
  const { db } = ctx;
  const auth = requireUser(db);

  app.get('/api/courses', { preHandler: auth }, async () => ({ courses: listCourses(db) }));

  app.get('/api/courses/:id', { preHandler: auth }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params, 'Route params');
    const course = getCourse(db, id);
    if (!course) throw httpError(404, 'course_not_found', `No course with id "${id}".`);
    return { course };
  });

  app.get('/api/lessons/:id', { preHandler: auth }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params, 'Route params');
    const lessonRow = getLessonRow(db, id);
    if (!lessonRow) throw httpError(404, 'lesson_not_found', `No lesson with id "${id}".`);
    const courseRow = getCourseRow(db, lessonRow.course_id);
    return {
      lesson: lessonToWire(lessonRow),
      course: courseRow
        ? { id: courseRow.id, code: courseRow.code, title: courseRow.title }
        : null,
    };
  });

  app.get('/api/assignments', { preHandler: auth }, async () => ({
    assignments: listAssignmentRows(db).map(assignmentToWire),
  }));

  app.get('/api/assignments/:id', { preHandler: auth }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params, 'Route params');
    const assignmentRow = getAssignmentRow(db, id);
    if (!assignmentRow) throw httpError(404, 'assignment_not_found', `No assignment with id "${id}".`);
    const submissionRow = getSubmissionForAssignment(db, request.auth!.userId, id);
    return {
      assignment: assignmentToWire(assignmentRow),
      submission: submissionRow ? submissionToWire(submissionRow) : null,
    };
  });
}
