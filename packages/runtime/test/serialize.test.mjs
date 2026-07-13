/**
 * Round-trip + edge-case tests for the serialization module.
 * Run with: node packages/runtime/test/serialize.test.mjs
 */
import assert from "node:assert/strict";
import {
  serialize,
  deserialize,
  toCacheKey,
  hash,
} from "../src/serialize.js";
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

async function roundTrip(name, value, assertFn) {
  await check(`round-trip: ${name}`, async () => {
    const s = await serialize(value);
    const d = deserialize(s);
    if (assertFn) {
      assertFn(d, s);
    } else {
      assert.deepEqual(d, value);
    }
  });
}

await check("primitives pass through", async () => {
  assert.equal(await serialize("hi"), "hi");
  assert.equal(await serialize(42), 42);
  assert.equal(await serialize(true), true);
  assert.equal(await serialize(null), null);
  assert.equal(await serialize(undefined), undefined);
  const big = await serialize(10n);
  assert.deepEqual(big, { __t: "n", v: "10" });
  assert.equal(deserialize(big), 10n);
});

await check("Date", async () => {
  const d = new Date("2026-07-13T00:00:00.000Z");
  const s = await serialize(d);
  assert.deepEqual(s, { __t: "d", v: d.toISOString() });
  assert.equal(deserialize(s).getTime(), d.getTime());
});

await check("RegExp", async () => {
  const re = /ab+c/gi;
  const s = await serialize(re);
  assert.deepEqual(s, { __t: "r", v: "/ab+c/gi" });
  const d = deserialize(s);
  assert.equal(d.source, "ab+c");
  assert.equal(d.flags, "gi");
});

await check("Error", async () => {
  const e = new TypeError("boom");
  const s = await serialize(e);
  assert.deepEqual(s, {
    __t: "e",
    v: { name: "TypeError", message: "boom", stack: e.stack },
  });
  const d = deserialize(s);
  assert.equal(d instanceof TypeError, true);
  assert.equal(d.message, "boom");
});

await check("Blob", async () => {
  const blob = new Blob(["hello world"], { type: "text/plain" });
  const s = await serialize(blob);
  assert.equal(s.__t, "l");
  assert.equal(s.m.type, "text/plain");
  assert.equal(typeof s.h, "string");
  // content-addressed: same content -> same hash
  const blob2 = new Blob(["hello world"], { type: "text/plain" });
  const s2 = await serialize(blob2);
  assert.equal(s2.h, s.h);
  // data retrievable from blob store (raw ArrayBuffer)
  const stored = blobStore.get(s.h);
  assert.equal(new TextDecoder().decode(stored), "hello world");
  // deserialized reconstructs a Blob
  const d = deserialize(s);
  assert.ok(d instanceof Blob);
  assert.equal(d.type, "text/plain");
  const dContent = await d.arrayBuffer();
  assert.equal(new TextDecoder().decode(dContent), "hello world");
});

await check("File keeps metadata", async () => {
  const file = new File(["data"], "note.txt", {
    type: "text/plain",
    lastModified: 12345,
  });
  const s = await serialize(file);
  assert.equal(s.__t, "f");
  assert.deepEqual(s.m, {
    name: "note.txt",
    type: "text/plain",
    lastModified: 12345,
  });
  // deserialized reconstructs a File
  const d = deserialize(s);
  assert.ok(d instanceof File);
  assert.equal(d.name, "note.txt");
  assert.equal(d.type, "text/plain");
  assert.equal(d.lastModified, 12345);
  const dContent = await d.arrayBuffer();
  assert.equal(new TextDecoder().decode(dContent), "data");
});

await check("ArrayBuffer", async () => {
  const buf = new Uint8Array([1, 2, 3, 4]).buffer;
  const s = await serialize(buf);
  assert.equal(s.__t, "b");
  const d = deserialize(s);
  assert.equal(d instanceof ArrayBuffer, true);
  assert.deepEqual(new Uint8Array(d), new Uint8Array([1, 2, 3, 4]));
});

await check("TypedArray (view into larger buffer)", async () => {
  const big = new ArrayBuffer(16);
  const full = new Uint8Array(big);
  full.set([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
  const view = new Uint8Array(big, 4, 4); // bytes 4..8
  view.set([10, 20, 30, 40]);
  const s = await serialize(view);
  assert.equal(s.__t, "b");
  const d = deserialize(s);
  assert.deepEqual(new Uint8Array(d), new Uint8Array([10, 20, 30, 40]));
});

await check("Map", async () => {
  const m = new Map([
    ["a", 1],
    ["b", new Date(0)],
  ]);
  const s = await serialize(m);
  assert.equal(s.__t, "m");
  const d = deserialize(s);
  assert.equal(d instanceof Map, true);
  assert.equal(d.get("a"), 1);
  assert.equal(d.get("b").getTime(), 0);
});

await check("Set", async () => {
  const set = new Set([1, "x", new Date(5)]);
  const s = await serialize(set);
  assert.equal(s.__t, "s");
  const d = deserialize(s);
  assert.equal(d instanceof Set, true);
  assert.equal(d.has(1), true);
  assert.equal(d.has("x"), true);
  assert.equal([...d].find((x) => x instanceof Date).getTime(), 5);
});

await check("nested plain object/array", async () => {
  const obj = { a: [1, 2, { b: "c" }], d: null };
  const s = await serialize(obj);
  assert.deepEqual(deserialize(s), obj);
});

await check("circular reference throws", async () => {
  const obj = {};
  obj.self = obj;
  await assert.rejects(() => serialize(obj), /Circular reference/);

  const m = new Map();
  m.set("self", m);
  await assert.rejects(() => serialize(m), /Circular reference/);

  const set = new Set();
  set.add(set);
  await assert.rejects(() => serialize(set), /Circular reference/);
});

await check("toCacheKey format", async () => {
  const key = await toCacheKey("importFile:1", { x: 1 });
  assert.match(key, /^importFile:1:[0-9a-f]{64}$/);
  // deterministic
  const key2 = await toCacheKey("importFile:1", { x: 1 });
  assert.equal(key, key2);
  // different args -> different key
  const key3 = await toCacheKey("importFile:1", { x: 2 });
  assert.notEqual(key, key3);
  // undefined args -> just stepId
  assert.equal(await toCacheKey("step"), "step");
});

await check("hash is sha256 hex of serialized", async () => {
  const h1 = await hash({ a: 1 });
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, await hash({ a: 1 }));
  assert.notEqual(h1, await hash({ a: 2 }));
});

await check("large binary keeps cache key compact", async () => {
  const big = new Uint8Array(1024 * 1024).fill(7); // 1MB
  const key = await toCacheKey("proc", { data: big });
  // key length is fixed regardless of payload size
  assert.equal(key.length, "proc".length + 1 + 64);
});

console.log(`\n${passed} checks passed.`);
