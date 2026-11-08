import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import type { TestContext } from 'node:test';
import { makeHlc, ulid } from '@edusync/protocol';
import { buildApp } from '../src/app';
import type { IncomingOp } from '../src/sync';

/**
 * Test utilities: every test gets its own temp SQLite file (so a second connection can be
 * opened for direct assertions) and its own Fastify instance driven through `inject`.
 */

export interface TestServer {
  app: FastifyInstance;
  dbPath: string;
  dir: string;
}

export function createTestServer(options: { seedCatalog?: boolean } = {}): TestServer {
  const dir = mkdtempSync(join(tmpdir(), 'edusync-server-test-'));
  const dbPath = join(dir, 'test.db');
  const app = buildApp({ dbPath, seedCatalog: options.seedCatalog });
  return { app, dbPath, dir };
}

/** Register cleanup on the test context. */
export function setup(t: TestContext, options: { seedCatalog?: boolean } = {}): TestServer {
  const server = createTestServer(options);
  t.after(async () => {
    await server.app.close();
    rmSync(server.dir, { recursive: true, force: true });
  });
  return server;
}

export interface LoginResult {
  token: string;
  deviceId: string;
  user: { id: string; name: string; role: string; email: string; initials: string };
}

export async function login(
  app: FastifyInstance,
  userId = 'u_aarav',
  deviceId = ulid(),
): Promise<LoginResult> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId, deviceId, platform: 'test' },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json<LoginResult & { serverTime: string }>();
  return { token: body.token, deviceId, user: body.user };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, unknown>;
}

/** Small inject wrapper: JSON in, parsed JSON out, bearer token attached. */
export async function api<T = unknown>(
  app: FastifyInstance,
  token: string | null,
  method: HTTPMethods,
  url: string,
  payload?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = token ? bearer(token) : {};
  const response = await app.inject({
    method,
    url,
    headers,
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
  return {
    status: response.statusCode,
    body: response.body.length > 0 ? response.json<T>() : (undefined as T),
    headers: response.headers,
  };
}

/** ---- op builders ---- */

export interface MakeOpInput {
  deviceId: string;
  entity: IncomingOp['entity'];
  entityId: string;
  payload: unknown;
  hlc: string;
  opId?: string;
  type?: IncomingOp['type'];
  baseRev?: number;
}

export function makeOp(input: MakeOpInput): IncomingOp {
  return {
    opId: input.opId ?? ulid(),
    deviceId: input.deviceId,
    hlc: input.hlc,
    entity: input.entity,
    entityId: input.entityId,
    type: input.type ?? 'create',
    baseRev: input.baseRev ?? 0,
    payload: input.payload,
  };
}

export const hlc = (physical: number, counter = 0, node = 'test-device'): string =>
  makeHlc(physical, counter, node);

export function draftPayload(
  answer: string,
  answerHlc: string,
  baseAnswerHlc: string | null = null,
  assignmentId = 'a_3',
): Record<string, unknown> {
  return { assignmentId, answer, answerHlc, baseAnswerHlc };
}

export function progressPayload(
  lessonId: string,
  percent: number,
  lastOpenedAt = '2026-01-01T00:00:00.000Z',
): Record<string, unknown> {
  return { lessonId, percent, lastOpenedAt };
}

export function submissionPayload(
  submissionId: string,
  options: { assignmentId?: string; contentHash?: string; body?: string; clientSubmittedAt?: string } = {},
): Record<string, unknown> {
  return {
    assignmentId: options.assignmentId ?? 'a_3',
    submissionId,
    contentHash: options.contentHash ?? `sha256:${submissionId}`,
    body: options.body ?? 'My worksheet answer about the pump stoichiometry.',
    clientSubmittedAt: options.clientSubmittedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

/** Push a batch through /api/sync/push and return the results in request order. */
export async function pushOps(
  app: FastifyInstance,
  token: string,
  ops: IncomingOp[],
): Promise<{
  results: { opId: string; status: string; serverRev: number; reason?: string }[];
  serverHlc: string;
  seq: number;
}> {
  const response = await api<{
    results: { opId: string; status: string; serverRev: number; reason?: string }[];
    serverHlc: string;
    seq: number;
  }>(app, token, 'POST', '/api/sync/push', { ops });
  if (response.status !== 200) {
    throw new Error(`push failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

export async function stateHash(
  app: FastifyInstance,
  token: string,
): Promise<{ seq: number; hash: string }> {
  const response = await api<{ seq: number; hash: string }>(app, token, 'GET', '/api/sync/state-hash');
  if (response.status !== 200) throw new Error(`state-hash failed: ${response.status}`);
  return response.body;
}

export function countRows(app: FastifyInstance, sql: string, ...params: (string | number)[]): number {
  const row = app.db.prepare(sql).get(...params) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}
