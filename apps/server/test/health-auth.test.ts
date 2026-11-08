import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { parseDevToken } from '../src/auth';
import { api, login, setup } from './helpers';

test('GET /api/health is public and reports an HLC', async (t) => {
  const { app } = setup(t);
  const response = await api<{ ok: boolean; time: string; serverHlc: string }>(
    app,
    null,
    'GET',
    '/api/health',
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.ok(!Number.isNaN(Date.parse(response.body.time)), 'time is ISO');
  assert.match(response.body.serverHlc, /^\d{13}:\d{5}:srv$/);
});

test('login mints a dev token, upserts the device and returns the user', async (t) => {
  const { app } = setup(t);
  const result = await login(app, 'u_aarav', 'device-a');

  assert.equal(result.user.id, 'u_aarav');
  assert.equal(result.user.name, 'Aarav Menon');
  assert.equal(result.user.role, 'student');
  assert.equal(result.user.email, 'aarav.menon@student.edu');
  assert.ok(result.token.startsWith('dev.'));

  const decoded = JSON.parse(Buffer.from(result.token.slice('dev.'.length), 'base64url').toString('utf8'));
  assert.deepEqual(decoded, { userId: 'u_aarav', deviceId: 'device-a' });
  assert.deepEqual(parseDevToken(result.token), { userId: 'u_aarav', deviceId: 'device-a' });

  const device = app.db.prepare('SELECT * FROM devices WHERE id = ?').get('device-a') as
    | { user_id: string; platform: string; last_seen_at: string }
    | undefined;
  assert.ok(device);
  assert.equal(device.user_id, 'u_aarav');
  assert.equal(device.platform, 'test');

  // Idempotent login: same device row, refreshed last_seen_at.
  const second = await login(app, 'u_aarav', 'device-a');
  assert.equal(second.token, result.token);
  const deviceCount = app.db.prepare('SELECT COUNT(*) AS count FROM devices').get() as { count: number };
  assert.equal(Number(deviceCount.count), 1);
});

test('GET /api/me returns the authenticated user', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app, 'u_yuki');
  const response = await api<{ user: { id: string; name: string } }>(app, token, 'GET', '/api/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, 'u_yuki');
  assert.equal(response.body.user.name, 'Yuki Tanaka');
});

test('auth rejects missing, malformed and unknown-user tokens with the error envelope', async (t) => {
  const { app } = setup(t);

  const missing = await api<{ error: string; message: string }>(app, null, 'GET', '/api/me');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error, 'unauthorized');
  assert.equal(typeof missing.body.message, 'string');

  const notADevToken = await api(app, 'opaque-token', 'GET', '/api/me');
  assert.equal(notADevToken.status, 401);

  const badPayload = await api(app, 'dev.!!!not-base64url-json', 'GET', '/api/me');
  assert.equal(badPayload.status, 401);

  // Valid token shape, but the user does not exist.
  const ghost = Buffer.from(JSON.stringify({ userId: 'u_ghost', deviceId: 'd1' }), 'utf8').toString('base64url');
  const unknownUser = await api(app, `dev.${ghost}`, 'GET', '/api/me');
  assert.equal(unknownUser.status, 401);
});

test('login validates its body and rejects unknown users', async (t) => {
  const { app } = setup(t);

  const invalid = await api<{ error: string; details: { path: string }[] }>(app, null, 'POST', '/api/auth/login', {
    deviceId: 'd1',
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'validation_error');
  assert.ok(invalid.body.details.some((issue) => issue.path === 'userId'));

  const unknown = await api<{ error: string }>(app, null, 'POST', '/api/auth/login', {
    userId: 'u_nobody',
    deviceId: 'd1',
  });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'user_not_found');
});

test('CORS preflight is open for the Vite dev origin', async (t) => {
  const { app } = setup(t);
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/api/courses',
    headers: {
      origin: 'http://127.0.0.1:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
  assert.match(String(response.headers['access-control-allow-headers']), /authorization/i);
});
