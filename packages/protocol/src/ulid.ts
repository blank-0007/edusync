/** Monotonic ULID: 48-bit time + 80-bit randomness, lexicographically sortable. */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RAND_LEN = 16;

let lastTime = -1;
let lastRandom = '';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function encodeTime(ms: number): string {
  let t = ms;
  let out = '';
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = t % 32;
    out = ENCODING[mod] + out;
    t = (t - mod) / 32;
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  // 80 bits -> 16 base32 chars
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ENCODING[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ENCODING[(value << (5 - bits)) & 31];
  return out.slice(0, RAND_LEN);
}

/** Increment a base32 random string, carrying from the right. */
function incrementRandom(chars: string): string {
  const digits = chars.split('').map((c) => ENCODING.indexOf(c));
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] < 31) {
      digits[i] += 1;
      return digits.map((d) => ENCODING[d]).join('');
    }
    digits[i] = 0;
  }
  return chars; // astronomically unlikely
}

/** Generate a ULID. Monotonic within the same millisecond on this device. */
export function ulid(now: number = Date.now()): string {
  const wall = Math.floor(now);
  let time: number;
  let rand: string;
  if (lastRandom === '' || wall > lastTime) {
    time = wall;
    rand = encodeRandom(randomBytes(10));
  } else {
    // same millisecond (or a clock that went backwards): keep time monotonic
    time = lastTime;
    rand = incrementRandom(lastRandom);
  }
  lastTime = time;
  lastRandom = rand;
  return encodeTime(time) + rand;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export function isUlid(value: string): boolean {
  return typeof value === 'string' && ULID_RE.test(value);
}

/** Decode the millisecond timestamp encoded in a ULID. */
export function ulidTime(id: string): number {
  let t = 0;
  for (const ch of id.slice(0, TIME_LEN)) t = t * 32 + ENCODING.indexOf(ch);
  return t;
}
