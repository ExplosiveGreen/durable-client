/**
 * Serialization module — walks value trees, replaces large binaries
 * with blob references, and produces deterministic string keys.
 */
import { sha256 } from "./hash.js";
import { blobStore } from "./blob-store.js";

export function serialize(value, visited = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (typeof value === "bigint") return { __t: "n", v: value.toString() };

  if (value instanceof Date) return { __t: "d", v: value.toISOString() };

  if (value instanceof Blob || value instanceof File) {
    const isFile = value instanceof File;
    const buf = value instanceof ArrayBuffer ? value : value.buffer;
    let arrayBuf;
    if (buf instanceof ArrayBuffer) {
      arrayBuf = buf;
    } else {
      const syncReader = new FileReaderSync();
      arrayBuf = syncReader.readAsArrayBuffer(value);
    }
    const h = sha256(arrayBuf);
    blobStore.set(h, arrayBuf);
    const meta = { name: value.name, type: value.type, lastModified: value.lastModified };
    return { __t: isFile ? "f" : "l", h, m: isFile ? meta : { type: value.type } };
  }

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const arrayBuf = value instanceof ArrayBuffer ? value : value.buffer;
    const h = sha256(arrayBuf);
    blobStore.set(h, arrayBuf);
    return { __t: "b", h };
  }

  if (value instanceof Map) {
    const entries = [];
    for (const [k, v] of value) {
      entries.push([serialize(k, visited), serialize(v, visited)]);
    }
    return { __t: "m", v: entries };
  }

  if (value instanceof Set) {
    const arr = [];
    for (const v of value) {
      arr.push(serialize(v, visited));
    }
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
        result.push(serialize(item, visited));
      }
      visited.delete(value);
      return result;
    }
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = serialize(value[key], visited);
    }
    visited.delete(value);
    return result;
  }

  return value;
}

export function deserialize(value) {
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
    const err = new Error(value.v.message);
    err.name = value.v.name;
    err.stack = value.v.stack;
    return err;
  }
  if (value.__t === "b") return blobStore.get(value.h);
  if (value.__t === "f") return blobStore.get(value.h);
  if (value.__t === "l") return blobStore.get(value.h);
  if (value.__t === "m") return new Map(value.v.map(([k, v]) => [deserialize(k), deserialize(v)]));
  if (value.__t === "s") return new Set(value.v.map(deserialize));

  const result = {};
  for (const key of Object.keys(value)) {
    result[key] = deserialize(value[key]);
  }
  return result;
}

export async function toCacheKey(stepId, args) {
  if (args === undefined) return stepId;
  const hash = await sha256(JSON.stringify(serialize(args)));
  return `${stepId}:${hash}`;
}
