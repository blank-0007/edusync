import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson, compareHlc, HybridClock, mergeField, parseHlc, ulid } from '../src/index';

test('ulid: unique, sortable and monotonic within the same millisecond', () => {
  const ids = Array.from({ length: 500 }, () => ulid(1_700_000_000_000));
  assert.equal(new Set(ids).size, 500);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted, 'ULIDs generated in order must sort in order');
  assert.equal(ids[0].length, 26);
});

test('hlc: encodes fixed width and string order equals causal order', () => {
  const a = new HybridClock('dev_a');
  const b = new HybridClock('dev_b');
  const t1 = a.now(1_000);
  const t2 = b.receive(t1, 1_000);
  assert.deepEqual(parseHlc(t1), { physical: 1000, counter: 0, node: 'dev_a' });
  assert.equal(compareHlc(t1, t2), -1);
  assert.ok(t1 < t2, 'lexicographic comparison must agree with HLC order');
  const t3 = a.receive(t2, 1_000);
  assert.ok(t3 > t2);
  const parts = parseHlc(t3);
  assert.equal(parts.physical, 1000);
  assert.equal(parts.counter, 2);
});

test('hlc: clock going backwards never regresses logical time', () => {
  const c = new HybridClock('dev_a');
  const first = c.now(2_000);
  const second = c.now(1_000);
  assert.ok(second > first);
});

test('mergeField: L0 identical, L2 sequential, L4 contested', () => {
  const hlc = (n: number) => `0000000001000:${String(n).padStart(5, '0')}:dev_a`;

  const same = mergeField({ v: 'hello', hlc: hlc(5) }, { v: 'hello', hlc: hlc(3) }, hlc(3));
  assert.equal(same.level, 'L0');
  assert.equal(same.contested, false);

  const sequential = mergeField({ v: 'hello world', hlc: hlc(6) }, { v: 'hello', hlc: hlc(5) }, hlc(5));
  assert.equal(sequential.level, 'L2');
  assert.equal(sequential.winner.v, 'hello world');
  assert.equal(sequential.contested, false);

  const race = mergeField({ v: 'side A', hlc: hlc(7) }, { v: 'side B', hlc: hlc(8) }, hlc(5));
  assert.equal(race.level, 'L4');
  assert.equal(race.contested, true);
  assert.equal(race.winner.v, 'side B');
  assert.equal(race.loser?.v, 'side A', 'the losing version must be retained');
});

test('canonicalJson: key order independent', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
});
