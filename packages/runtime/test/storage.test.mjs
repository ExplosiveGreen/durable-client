/**
 * Tests for the storage layer (steps + blobs) and the pluggable
 * Storage interface. Run with: node packages/runtime/test/storage.test.mjs
 */
import assert from "node:assert/strict";
import {
  Storage,
  InMemoryStore,
  stepStore,
  clearAll,
} from "../src/storage.js";
import { blobStore } from "../src/blob-store.js";

let passed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok  - ${name}`);
    })
    .catch((err) => {
      console.error(`  FAIL - ${name}`);
      console.error("       " + (err && err.stack ? err.stack : err));
      process.exitCode = 1;
    });
}

// ---------------------------------------------------------------------------
// Pluggable Storage interface
// ---------------------------------------------------------------------------

await check("Storage base class methods throw (documents contract)", async () => {
  const s = new Storage();
  await assert.rejects(async () => s.get("k"), /not implemented/);
  await assert.rejects(async () => s.set("k", 1), /not implemented/);
  await assert.rejects(async () => s.has("k"), /not implemented/);
  await assert.rejects(async () => s.delete("k"), /not implemented/);
  await assert.rejects(async () => s.clear(), /not implemented/);
});

await check("InMemoryStore is a Storage", async () => {
  assert.ok(new InMemoryStore() instanceof Storage);
});

// ---------------------------------------------------------------------------
// Step store: basic operations
// ---------------------------------------------------------------------------

await check("stepStore: basic set/get/has/delete", async () => {
  clearAll();
  assert.equal(stepStore.has("a"), false);
  stepStore.set("a", "value");
  assert.equal(stepStore.has("a"), true);
  assert.equal(stepStore.get("a"), "value");
  assert.equal(stepStore.delete("a"), true);
  assert.equal(stepStore.has("a"), false);
  assert.equal(stepStore.get("a"), null);
});

await check("stepStore: missing key returns null (not undefined)", async () => {
  clearAll();
  const result = stepStore.get("never-set");
  assert.equal(result, null);
  assert.equal(result === undefined, false);
});

await check("stepStore: stored undefined is distinguishable from missing key", async () => {
  clearAll();
  stepStore.set("u", undefined);
  // present, value is undefined
  assert.equal(stepStore.has("u"), true);
  assert.equal(stepStore.get("u"), undefined);
  // absent key
  assert.equal(stepStore.has("missing"), false);
  assert.equal(stepStore.get("missing"), null);
  // the two cases must not be conflated
  assert.notEqual(stepStore.get("u"), stepStore.get("missing"));
});

await check("stepStore: clear() empties the store", async () => {
  clearAll();
  stepStore.set("x", 1);
  stepStore.set("y", 2);
  stepStore.clear();
  assert.equal(stepStore.has("x"), false);
  assert.equal(stepStore.has("y"), false);
  assert.equal(stepStore.get("x"), null);
});

// ---------------------------------------------------------------------------
// Blob store: basic operations + deduplication
// ---------------------------------------------------------------------------

await check("blobStore: basic set/get/has/delete", async () => {
  clearAll();
  const buf = new Uint8Array([1, 2, 3]).buffer;
  assert.equal(blobStore.has("h1"), false);
  blobStore.set("h1", buf);
  assert.equal(blobStore.has("h1"), true);
  assert.equal(blobStore.get("h1"), buf);
  assert.equal(blobStore.delete("h1"), true);
  assert.equal(blobStore.has("h1"), false);
  assert.equal(blobStore.get("h1"), null);
});

await check("blobStore: missing key returns null (not undefined)", async () => {
  clearAll();
  const result = blobStore.get("never-set");
  assert.equal(result, null);
  assert.equal(result === undefined, false);
});

await check("blobStore: stored undefined is distinguishable from missing key", async () => {
  clearAll();
  blobStore.set("u", undefined);
  assert.equal(blobStore.has("u"), true);
  assert.equal(blobStore.get("u"), undefined);
  assert.equal(blobStore.has("missing"), false);
  assert.equal(blobStore.get("missing"), null);
  assert.notEqual(blobStore.get("u"), blobStore.get("missing"));
});

await check("blobStore: deduplication — same key set twice keeps first value", async () => {
  clearAll();
  const first = new Uint8Array([9, 9, 9]).buffer;
  const second = new Uint8Array([0, 0, 0]).buffer;
  blobStore.set("dup", first);
  blobStore.set("dup", second); // should be ignored (dedup)
  assert.equal(blobStore.get("dup"), first);
  assert.notEqual(blobStore.get("dup"), second);
  // still only one entry
  assert.equal(blobStore.has("dup"), true);
});

await check("blobStore: clear() empties the store", async () => {
  clearAll();
  blobStore.set("b1", new Uint8Array([1]).buffer);
  blobStore.set("b2", new Uint8Array([2]).buffer);
  blobStore.clear();
  assert.equal(blobStore.has("b1"), false);
  assert.equal(blobStore.has("b2"), false);
});

// ---------------------------------------------------------------------------
// Cross-store: clearAll clears both
// ---------------------------------------------------------------------------

await check("clearAll() clears both step and blob stores", async () => {
  stepStore.set("s", "v");
  blobStore.set("b", new Uint8Array([7]).buffer);
  assert.equal(stepStore.has("s"), true);
  assert.equal(blobStore.has("b"), true);
  clearAll();
  assert.equal(stepStore.has("s"), false);
  assert.equal(blobStore.has("b"), false);
  assert.equal(stepStore.get("s"), null);
  assert.equal(blobStore.get("b"), null);
});

console.log(`\n${passed} checks passed.`);
