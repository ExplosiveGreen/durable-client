/**
 * Serialization module — walks value trees, replaces large binaries
 * with blob references, and produces deterministic string keys.
 */
const { sha256 } = require("./hash.js");
const { blobStore } = require("./blob-store.js");

async function serialize(value, visited = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (typeof value === "bigint") return { __t: "n", v: value.toString() };

  if (value instanceof Date) return { __t: "d", v: value.toISOString() };

  if (typeof Blob !== "undefined" && typeof File !== "undefined" && (value instanceof Blob || value instanceof File)) {
    const isFile = value instanceof File;
    const arrayBuf = await value.arrayBuffer();
    const h = await sha256(arrayBuf);
    blobStore.set(h, arrayBuf);
    const meta = { name: value.name, type: value.type, lastModified: value.lastModified };
    return { __t: isFile ? "f" : "l", h, m: isFile ? meta : { type: value.type } };
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    // For TypedArray/DataView, copy only the bytes actually covered by the
    // view (byteOffset..byteOffset+byteLength) rather than the whole buffer,
    // which may be a larger shared ArrayBuffer.
    const arrayBuf =
      value instanceof ArrayBuffer
        ? value
        : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    const h = await sha256(arrayBuf);
    blobStore.set(h, arrayBuf);
    return { __t: "b", h };
  }

  if (value instanceof Map) {
    if (visited.has(value)) {
      throw new Error("Circular reference detected during serialization");
    }
    visited.add(value);
    const entries = [];
    for (const [k, v] of value) {
      entries.push([await serialize(k, visited), await serialize(v, visited)]);
    }
    visited.delete(value);
    return { __t: "m", v: entries };
  }

  if (value instanceof Set) {
    if (visited.has(value)) {
      throw new Error("Circular reference detected during serialization");
    }
    visited.add(value);
    const arr = [];
    for (const v of value) {
      arr.push(await serialize(v, visited));
    }
    visited.delete(value);
    return { __t: "s", v: arr };
  }

  if (value instanceof RegExp) {
    return { __t: "r", v: `/${value.source}/${value.flags}` };
  }

  if (value instanceof Error) {
    return { __t: "e", v: { name: value.name, message: value.message, stack: value.stack } };
  }

  if (typeof value === "object") {
    if (visited.has(value)) {
      throw new Error("Circular reference detected during serialization");
    }
    visited.add(value);
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) {
        result.push(await serialize(item, visited));
      }
      visited.delete(value);
      return result;
    }
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = await serialize(value[key], visited);
    }
    visited.delete(value);
    return result;
  }

  return value;
}

function deserialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deserialize);

  if (value.__t === "d") return new Date(value.v);
  if (value.__t === "n") return BigInt(value.v);
  if (value.__t === "r") {
    const match = value.v.match(/^\/(.*)\/([a-z]*)$/);
    return match ? new RegExp(match[1], match[2]) : value.v;
  }
  if (value.__t === "e") {
    const name = value.v.name;
    // Reconstruct the original error subclass when available (TypeError,
    // RangeError, etc.), falling back to a plain Error.
    const Ctor =
      typeof globalThis[name] === "function" && /Error$/.test(name)
        ? globalThis[name]
        : Error;
    const err = new Ctor(value.v.message);
    err.name = name;
    err.stack = value.v.stack;
    return err;
  }
  if (value.__t === "b") return blobStore.get(value.h);
  if (value.__t === "f") {
    if (typeof File === "undefined") {
      throw new Error("Cannot deserialize File: File constructor is not available");
    }
    const data = blobStore.get(value.h);
    return new File([data], value.m.name, {
      type: value.m.type,
      lastModified: value.m.lastModified,
    });
  }
  if (value.__t === "l") {
    if (typeof Blob === "undefined") {
      throw new Error("Cannot deserialize Blob: Blob constructor is not available");
    }
    const data = blobStore.get(value.h);
    return new Blob([data], { type: value.m.type });
  }
  if (value.__t === "m") return new Map(value.v.map(([k, v]) => [deserialize(k), deserialize(v)]));
  if (value.__t === "s") return new Set(value.v.map(deserialize));

  const result = {};
  for (const key of Object.keys(value)) {
    result[key] = deserialize(value[key]);
  }
  return result;
}

async function toCacheKey(stepId, args) {
  if (args === undefined) return stepId;
  const hash = await sha256(JSON.stringify(await serialize(args)));
  return `${stepId}:${hash}`;
}

/**
 * SHA-256 of the serialized string form of a value (PLAN.md §1.3).
 */
async function hash(value) {
  return await sha256(JSON.stringify(await serialize(value)));
}

module.exports = { serialize, deserialize, toCacheKey, hash };
