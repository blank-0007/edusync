/**
 * Minimal base64 <-> Uint8Array codec for Yjs updates on the wire (CONTRACT.md §D2).
 * `btoa`/`atob` are used because they exist in every browser (and in the Workers the app
 * may eventually move syncing to); Node only needs the string helpers during acceptance.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decode base64 that may be absent/corrupt without throwing at call sites. */
export function tryBase64ToBytes(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;
  try {
    return base64ToBytes(value);
  } catch {
    return null;
  }
}
