import { canonicalJson } from './canonical';
import { compareHlc } from './hlc';

export interface Field<T> {
  v: T;
  hlc: string;
}

export type LadderLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface MergeOutcome<T> {
  level: LadderLevel;
  winner: Field<T>;
  loser: Field<T> | null;
  /** True when the two sides were concurrent and the value differs: keep both, surface a conflict. */
  contested: boolean;
  reason: string;
}

/**
 * L0: identical values and stamps -> true no-op.
 * L1: identical values, newer stamp -> idempotent advance (subsumed in L0 for wire).
 * L2: sequential edit (base matches current) -> winner applied cleanly.
 * L3: out-of-order delivery (base is newer than current) -> newer HLC applied cleanly.
 * L4: concurrent + different values -> HLC winner applied, both versions retained in Conflict Inbox.
 */
export function mergeField<T extends string | number | boolean | null>(
  incoming: Field<T>,
  current: Field<T> | undefined,
  /** HLC the client based its write on; lets us tell "stale but same value" from a real race. */
  baseHlc: string | null,
): MergeOutcome<T> {
  if (!current) {
    return { level: 'L2', winner: incoming, loser: null, contested: false, reason: 'first write' };
  }
  if (canonicalJson(incoming.v) === canonicalJson(current.v)) {
    return { level: 'L0', winner: current, loser: null, contested: false, reason: 'identical value' };
  }
  const order = compareHlc(incoming.hlc, current.hlc);

  // The client wrote against the exact version it saw: not a race, just a later edit.
  if (baseHlc !== null && baseHlc === current.hlc) {
    const winner = order >= 0 ? incoming : current;
    const loser = order >= 0 ? current : incoming;
    return { level: 'L2', winner, loser, contested: false, reason: 'sequential edit (base matches)' };
  }

  // The client never saw the current value (or saw an older one): concurrent edits.
  const concurrent = baseHlc === null || compareHlc(baseHlc, current.hlc) < 0;
  if (concurrent) {
    const winner = order >= 0 ? incoming : current;
    const loser = order >= 0 ? current : incoming;
    return {
      level: 'L4',
      winner,
      loser,
      contested: true,
      reason: 'concurrent edits: both versions retained, Conflict Inbox item opened',
    };
  }

  // L3: Client saw a newer value than the server holds (out-of-order delivery): keep the newer one.
  const winner = order >= 0 ? incoming : current;
  return { level: 'L3', winner, loser: order >= 0 ? current : incoming, contested: false, reason: 'out-of-order delivery' };
}
