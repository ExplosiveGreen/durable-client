/**
 * SHA-256 hashing for cache keys and content addressing.
 */

async function sha256(input) {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (!subtle) {
    throw new Error("sha256: WebCrypto API (crypto.subtle) is not available");
  }
  if (typeof input === "string") {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await subtle.digest("SHA-256", data);
    return bufferToHex(hashBuffer);
  }
  if (input instanceof ArrayBuffer) {
    const hashBuffer = await subtle.digest("SHA-256", input);
    return bufferToHex(hashBuffer);
  }
  throw new Error("sha256: expected string or ArrayBuffer");
}

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

module.exports = { sha256, bufferToHex };
