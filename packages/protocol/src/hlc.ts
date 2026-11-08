/**
 * Hybrid Logical Clock.
 * Encoded as "physicalMs:counter:node" with fixed-width zero padding so that
 * plain lexicographic string comparison is also causal ordering.
 */
export interface HlcParts {
  physical: number;
  counter: number;
  node: string;
}

const PHYS_PAD = 13;
const CTR_PAD = 5;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function makeHlc(physical: number, counter: number, node: string): string {
  return `${pad(Math.floor(physical), PHYS_PAD)}:${pad(counter, CTR_PAD)}:${node}`;
}

export function parseHlc(hlc: string): HlcParts {
  const first = hlc.indexOf(':');
  const second = hlc.indexOf(':', first + 1);
  if (first < 0 || second < 0) throw new Error(`invalid hlc: ${hlc}`);
  return {
    physical: Number(hlc.slice(0, first)),
    counter: Number(hlc.slice(first + 1, second)),
    node: hlc.slice(second + 1),
  };
}

/** Total order over HLC strings (physical, then counter, then node). */
export function compareHlc(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function maxHlc(a: string, b: string): string {
  return compareHlc(a, b) >= 0 ? a : b;
}

export class HybridClock {
  private physical = 0;
  private counter = 0;
  readonly node: string;

  constructor(node: string, physical = 0, counter = 0) {
    if (!node || node.includes(':')) throw new Error('hlc node must be non-empty and contain no ":"');
    this.node = node;
    this.physical = physical;
    this.counter = counter;
  }

  /** Advance for a local event and return the new HLC stamp. */
  now(nowMs: number = Date.now()): string {
    const wall = Math.floor(nowMs);
    if (wall > this.physical) {
      this.physical = wall;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return this.encode();
  }

  /** Merge a remote HLC (from a received message) and return a new local stamp. */
  receive(remote: string, nowMs: number = Date.now()): string {
    const r = parseHlc(remote);
    const wall = Math.floor(nowMs);
    const phys = Math.max(this.physical, r.physical, wall);
    if (phys === this.physical && phys === r.physical) {
      this.counter = Math.max(this.counter, r.counter) + 1;
    } else if (phys === this.physical) {
      this.counter += 1;
    } else if (phys === r.physical) {
      this.counter = r.counter + 1;
    } else {
      this.counter = 0;
    }
    this.physical = phys;
    return this.encode();
  }

  encode(): string {
    return makeHlc(this.physical, this.counter, this.node);
  }

  get state(): HlcParts {
    return { physical: this.physical, counter: this.counter, node: this.node };
  }
}
