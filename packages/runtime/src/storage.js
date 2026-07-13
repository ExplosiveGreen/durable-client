/**
 * Storage layer — two namespaced stores (steps + blobs) with
 * an in-memory Map fallback and IndexedDB persistence when available.
 *
 * The `Storage` class defines the pluggable storage interface (PLAN.md §4.1).
 * Custom adapters (IndexedDB, localStorage, OPFS, …) can extend it and be
 * swapped in without touching the rest of the runtime.
 */
import { blobStore } from "./blob-store.js";

/**
 * Pluggable storage interface.
 *
 * Implementations must provide:
 *   - get(key)    → value | null   (null when the key is absent; a stored
 *                                    `undefined` is returned as `undefined`,
 *                                    which is distinct from absence)
 *   - set(key, v) → void
 *   - has(key)    → boolean
 *   - delete(key) → boolean
 *   - clear()     → void
 *
 * The base implementation throws, so it both documents the contract and
 * serves as the extension point for custom adapters.
 */
export class Storage {
  get(_key) {
    throw new Error("Storage.get() not implemented");
  }
  set(_key, _value) {
    throw new Error("Storage.set() not implemented");
  }
  has(_key) {
    throw new Error("Storage.has() not implemented");
  }
  delete(_key) {
    throw new Error("Storage.delete() not implemented");
  }
  clear() {
    throw new Error("Storage.clear() not implemented");
  }
}

/**
 * In-memory implementation of the Storage interface backed by a Map.
 * Used directly when IndexedDB is unavailable, and as the reference
 * implementation / mock for tests.
 */
export class InMemoryStore extends Storage {
  constructor() {
    super();
    this._map = new Map();
  }

  get(key) {
    // Distinguish a missing key (return null) from a stored `undefined`
    // value (return undefined). Using `Map.get(key) ?? null` would
    // conflate the two cases, so we check `has` first.
    if (this._map.has(key)) {
      return this._map.get(key);
    }
    return null;
  }

  set(key, value) {
    this._map.set(key, value);
  }

  has(key) {
    return this._map.has(key);
  }

  delete(key) {
    return this._map.delete(key);
  }

  clear() {
    this._map.clear();
  }
}

export const stepStore = new InMemoryStore();

/**
 * Clear both the step store and the blob store.
 */
export function clearAll() {
  stepStore.clear();
  blobStore.clear();
}
