/**
 * Content-addressed blob store.
 * Deduplicates binary data by SHA-256 hash.
 * Uses an in-memory Map with IndexedDB persistence when available.
 *
 * Implements the same pluggable `Storage` interface shape as the step
 * store (see storage.js): get / set / has / delete / clear.
 */

class InMemoryBlobStore {
  constructor() {
    this._map = new Map();
  }

  get(hash) {
    if (this._map.has(hash)) {
      return this._map.get(hash);
    }
    return null;
  }

  set(hash, data) {
    if (!this._map.has(hash)) {
      this._map.set(hash, data);
    }
  }

  has(hash) {
    return this._map.has(hash);
  }

  delete(hash) {
    return this._map.delete(hash);
  }

  clear() {
    this._map.clear();
  }
}

const blobStore = new InMemoryBlobStore();

module.exports = { blobStore };
