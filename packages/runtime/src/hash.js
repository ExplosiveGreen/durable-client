/**
 * SHA-256 hashing for cache keys and content addressing.
 * @category Hashing
 *
 * Resolution order for the sha256 implementation:
 *   1. Custom implementation registered via `registerSha256()` (if any).
 *   2. WebCrypto (crypto.subtle) when available.
 *   3. Bundled pure-JS fallback (works everywhere, including Hermes in
 *      React Native / Expo where crypto.subtle is absent).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Encode a JS string as UTF-8 bytes (TextEncoder when available,
 * manual fallback otherwise).
 * @category Hashing
 */
function utf8Encode(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
        continue;
      }
    }
    out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(out);
}

/**
 * Pure-JS SHA-256. Accepts a string (UTF-8), Uint8Array, or ArrayBuffer.
 * Returns a lowercase hex string. Used when WebCrypto is unavailable.
 * @category Hashing
 */
function sha256Bytes(data) {
  let bytes;
  if (typeof data === "string") {
    bytes = utf8Encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    throw new Error("sha256 (js fallback): expected string, Uint8Array, or ArrayBuffer");
  }

  const bitLen = bytes.length * 8;
  const bitLenHi = Math.floor(bitLen / 0x100000000);
  const bitLenLo = bitLen >>> 0;
  const nBlocks = Math.ceil((bytes.length + 1 + 8) / 64);
  const padded = new Uint8Array(nBlocks * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLenHi);
  view.setUint32(padded.length - 4, bitLenLo);

  const h = new Uint32Array(H0);
  const w = new Uint32Array(64);

  for (let block = 0; block < nBlocks; block++) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(block * 64 + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0], b = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += h[i].toString(16).padStart(8, "0");
  }
  return hex;
}

/**
 * Register a custom SHA-256 implementation. The function receives the
 * same input as `sha256` (string or ArrayBuffer) and must return (or
 * resolve to) a lowercase hex string. Useful for plugging in platform
 * natives such as `expo-crypto`.
 * @category Hashing
 */
function registerSha256(impl) {
  if (impl !== null && typeof impl !== "function") {
    throw new Error("registerSha256: expected a function (or null to reset)");
  }
  customSha256 = impl;
}

let customSha256 = null;

/**
 * SHA-256 of a string or ArrayBuffer, returned as lowercase hex.
 * Uses, in order: a registered custom impl, WebCrypto, or the bundled
 * pure-JS fallback.
 * @category Hashing
 */
async function sha256(input) {
  if (customSha256) {
    return await customSha256(input);
  }
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle && typeof subtle.digest === "function") {
    if (typeof input === "string") {
      const data = new TextEncoder().encode(input);
      return bufferToHex(await subtle.digest("SHA-256", data));
    }
    if (input instanceof ArrayBuffer) {
      return bufferToHex(await subtle.digest("SHA-256", input));
    }
    throw new Error("sha256: expected string or ArrayBuffer");
  }
  return sha256Bytes(input);
}

/**
 * Convert an ArrayBuffer to a hex string.
 * @category Hashing
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

module.exports = { sha256, sha256Bytes, registerSha256, bufferToHex, utf8Encode };