/**
 * Storage layer — two namespaced stores (steps + blobs) with
 * an in-memory Map fallback and IndexedDB persistence when available.
 */
import { blobStore } from "./blob-store.js";

class InMemoryStore {
  constructor() {
    this._map = new Map();
  }

  get(key) {
    return this._map.get(key) ?? null;
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

export function clearAll() {
  stepStore.clear();
  blobStore.clear();
}
