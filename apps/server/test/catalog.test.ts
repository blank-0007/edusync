import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, login, setup } from './helpers';

test('catalog is seeded: course BIOL 201 with 6 lessons and assignment a_3', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);

  const courses = await api<{ courses: { id: string; code: string; title: string; lessonCount: number }[] }>(
    app,
    token,
    'GET',
    '/api/courses',
  );
  assert.equal(courses.status, 200);
  assert.equal(courses.body.courses.length, 1);
  assert.deepEqual(courses.body.courses[0], {
    id: 'c_bio201',
    code: 'BIOL 201',
    title: 'Cell Biology',
    lessonCount: 6,
  });

  const course = await api<{
    course: {
      id: string;
      title: string;
      code: string;
      instructorId: string;
      instructorName: string;
      lessons: { id: string; title: string; position: number; durationMin: number; body: string; media: unknown[] }[];
    };
  }>(app, token, 'GET', '/api/courses/c_bio201');
  assert.equal(course.status, 200);
  assert.equal(course.body.course.instructorId, 'u_priya');
  assert.equal(course.body.course.instructorName, 'Dr. Priya Nair');
  assert.equal(course.body.course.lessons.length, 6);

  const lessons = course.body.course.lessons;
  assert.deepEqual(
    lessons.map((lesson) => lesson.id),
    ['l_1', 'l_2', 'l_3', 'l_4', 'l_5', 'l_6'],
  );
  assert.deepEqual(
    lessons.map((lesson) => lesson.position),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(lessons[0].title, 'Osmosis and tonicity');
  assert.equal(lessons[0].durationMin, 9);
  assert.equal(lessons[2].title, 'Ion pumps and the Na⁺/K⁺ ATPase');
  assert.equal(lessons[2].durationMin, 14);
  for (const lesson of lessons) {
    assert.ok(lesson.body.length > 400, `${lesson.id} has a substantive body`);
    assert.ok(Array.isArray(lesson.media) && lesson.media.length > 0, `${lesson.id} has media`);
  }
});

test('GET /api/lessons/:id returns the lesson and its course summary', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);

  const response = await api<{
    lesson: { id: string; courseId: string; title: string; body: string; media: unknown[] };
    course: { id: string; code: string; title: string } | null;
  }>(app, token, 'GET', '/api/lessons/l_5');
  assert.equal(response.status, 200);
  assert.equal(response.body.lesson.id, 'l_5');
  assert.equal(response.body.lesson.courseId, 'c_bio201');
  assert.match(response.body.lesson.title, /Lab 3 prep/);
  assert.ok(response.body.lesson.body.length > 400);
  assert.deepEqual(response.body.course, { id: 'c_bio201', code: 'BIOL 201', title: 'Cell Biology' });

  const missing = await api<{ error: string }>(app, token, 'GET', '/api/lessons/l_nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'lesson_not_found');
});

test('assignment a_3 carries the 4-criterion rubric and a due date ~3 days out', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);

  const list = await api<{
    assignments: { id: string; title: string; points: number; dueAt: string; rubric: { id: string; points: number }[] }[];
  }>(app, token, 'GET', '/api/assignments');
  assert.equal(list.status, 200);
  assert.equal(list.body.assignments.length, 1);
  const assignment = list.body.assignments[0];
  assert.equal(assignment.id, 'a_3');
  assert.equal(assignment.title, 'Membrane transport worksheet');
  assert.equal(assignment.points, 14);
  assert.equal(assignment.rubric.length, 4);
  assert.deepEqual(
    assignment.rubric.map((criterion) => criterion.id),
    ['r1', 'r2', 'r3', 'r4'],
  );
  assert.deepEqual(
    assignment.rubric.map((criterion) => criterion.points),
    [4, 4, 3, 3],
  );

  const dueMs = Date.parse(assignment.dueAt);
  const daysOut = (dueMs - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(daysOut > 2 && daysOut <= 3.01, `due date is ~3 days out (got ${daysOut})`);

  const detail = await api<{
    assignment: { id: string; prompt: string; rubric: { label: string; hint: string }[] };
    submission: unknown;
  }>(app, token, 'GET', '/api/assignments/a_3');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.assignment.id, 'a_3');
  assert.equal(detail.body.submission, null);
  assert.match(detail.body.assignment.prompt, /Na⁺\/K⁺ ATPase/);
  assert.equal(detail.body.assignment.rubric[0].hint, 'Covered in line 2');
  assert.equal(detail.body.assignment.rubric[3].hint, 'Na⁺ and K⁺ quoted; Cl⁻ missing');

  const missing = await api<{ error: string }>(app, token, 'GET', '/api/assignments/a_nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'assignment_not_found');
});

test('catalog routes require authentication', async (t) => {
  const { app } = setup(t);
  for (const url of ['/api/courses', '/api/courses/c_bio201', '/api/assignments', '/api/assignments/a_3', '/api/submissions/mine']) {
    const response = await api(app, null, 'GET', url);
    assert.equal(response.status, 401, `${url} requires auth`);
  }
});
