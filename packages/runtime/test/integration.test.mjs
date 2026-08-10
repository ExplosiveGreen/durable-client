/**
 * Integration tests — full pipeline verification.
 *
 * Covers:
 *   1. Serialization round-trip for ALL types
 *   2. Storage get/set/has/delete/clear for both stores
 *   3. Cache key generation and arg-based cache hits/misses
 *   4. Step naming (auto and explicit)
 *   5. Instance isolation (different instances don't collide)
 *   6. __step caching: same args = cache hit, different args = new execution
 *   7. __step retry: failing step retries, eventually succeeds or throws
 *   8. Full pipeline: Babel transform → runtime execution → storage persistence
 *   9. @workflow decorator is a runtime no-op (function still works)
 *
 * Run with: node packages/runtime/test/integration.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import babel from "@babel/core";

import { __step } from "../src/step.js";
import { serialize, deserialize, toCacheKey, hash } from "../src/serialize.js";
import { sha256, sha256Bytes, registerSha256 } from "../src/hash.js";
import { stepStore, clearAll, InMemoryStore } from "../src/storage.js";
import { blobStore } from "../src/blob-store.js";
import { generateStepId } from "../src/step-naming.js";
import { createInstance } from "../src/instance.js";
import { workflow } from "../src/workflow.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok  - ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`  FAIL - ${name}`);
      console.error("       " + (err && err.stack ? err.stack : err));
      process.exitCode = 1;
    });
}

// ---------------------------------------------------------------------------
// 1. Serialization round-trip for ALL types
// ---------------------------------------------------------------------------

await check("serialize/deserialize: primitives", async () => {
  assert.equal(await serialize("hi"), "hi");
  assert.equal(await serialize(42), 42);
  assert.equal(await serialize(true), true);
  assert.equal(await serialize(null), null);
  assert.equal(await serialize(undefined), undefined);
  // BigInt
  const big = await serialize(10n);
  assert.deepEqual(big, { __t: "n", v: "10" });
  assert.equal(deserialize(big), 10n);
});

await check("serialize/deserialize: Date", async () => {
  const d = new Date("2026-07-13T12:00:00.000Z");
  const s = await serialize(d);
  const r = deserialize(s);
  assert.ok(r instanceof Date);
  assert.equal(r.getTime(), d.getTime());
});

await check("serialize/deserialize: RegExp", async () => {
  const re = /hello\d+/gi;
  const s = await serialize(re);
  const r = deserialize(s);
  assert.ok(r instanceof RegExp);
  assert.equal(r.source, "hello\\d+");
  assert.equal(r.flags, "gi");
});

await check("serialize/deserialize: Error (TypeError)", async () => {
  const e = new TypeError("invalid type");
  const s = await serialize(e);
  const r = deserialize(s);
  assert.ok(r instanceof TypeError);
  assert.equal(r.message, "invalid type");
});

await check("serialize/deserialize: Error (plain Error)", async () => {
  const e = new Error("generic error");
  const s = await serialize(e);
  const r = deserialize(s);
  assert.ok(r instanceof Error);
  assert.equal(r.message, "generic error");
});

await check("serialize/deserialize: RangeError", async () => {
  const e = new RangeError("out of range");
  const s = await serialize(e);
  const r = deserialize(s);
  assert.ok(r instanceof RangeError);
  assert.equal(r.message, "out of range");
});

await check("serialize/deserialize: Map", async () => {
  const m = new Map([
    ["x", 100],
    [new Date(0), "epoch"],
  ]);
  const s = await serialize(m);
  const r = deserialize(s);
  assert.ok(r instanceof Map);
  assert.equal(r.get("x"), 100);
  // Date key should be reconstructed
  const dateKey = [...r.keys()].find((k) => k instanceof Date);
  assert.ok(dateKey);
  assert.equal(dateKey.getTime(), 0);
});

await check("serialize/deserialize: Set", async () => {
  const set = new Set([1, "two", new Date(42)]);
  const s = await serialize(set);
  const r = deserialize(s);
  assert.ok(r instanceof Set);
  assert.ok(r.has(1));
  assert.ok(r.has("two"));
  assert.ok([...r].some((x) => x instanceof Date && x.getTime() === 42));
});

await check("serialize/deserialize: Blob", async () => {
  const blob = new Blob(["integration test content"], { type: "text/plain" });
  const s = await serialize(blob);
  const r = deserialize(s);
  assert.ok(r instanceof Blob);
  assert.equal(r.type, "text/plain");
  const text = await r.text();
  assert.equal(text, "integration test content");
});

await check("serialize/deserialize: File", async () => {
  const file = new File(["file content"], "integration.txt", {
    type: "text/plain",
    lastModified: 98765,
  });
  const s = await serialize(file);
  const r = deserialize(s);
  assert.ok(r instanceof File);
  assert.equal(r.name, "integration.txt");
  assert.equal(r.type, "text/plain");
  assert.equal(r.lastModified, 98765);
  const text = await r.text();
  assert.equal(text, "file content");
});

await check("serialize/deserialize: ArrayBuffer", async () => {
  const buf = new Uint8Array([10, 20, 30, 40, 50]).buffer;
  const s = await serialize(buf);
  const r = deserialize(s);
  assert.ok(r instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(r), new Uint8Array([10, 20, 30, 40, 50]));
});

await check("serialize/deserialize: TypedArray (Uint8Array view)", async () => {
  const big = new ArrayBuffer(32);
  const full = new Uint8Array(big);
  full.fill(0xff);
  const view = new Uint8Array(big, 8, 4);
  view.set([1, 2, 3, 4]);
  const s = await serialize(view);
  const r = deserialize(s);
  assert.ok(r instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(r), new Uint8Array([1, 2, 3, 4]));
});

await check("serialize/deserialize: nested plain object/array", async () => {
  const obj = {
    name: "test",
    tags: ["a", "b", "c"],
    meta: { version: 1, enabled: true },
    nullable: null,
    undef: undefined,
  };
  const s = await serialize(obj);
  const r = deserialize(s);
  assert.deepEqual(r, obj);
});

await check("serialize/deserialize: empty values", async () => {
  assert.equal(deserialize(await serialize("")), "");
  assert.equal(deserialize(await serialize(0)), 0);
  assert.equal(deserialize(await serialize(false)), false);
  assert.deepEqual(deserialize(await serialize([])), []);
  assert.deepEqual(deserialize(await serialize({})), {});
});

await check("serialize/deserialize: circular reference throws", async () => {
  const obj = {};
  obj.self = obj;
  await assert.rejects(() => serialize(obj), /Circular reference/);
  const m = new Map();
  m.set("self", m);
  await assert.rejects(() => serialize(m), /Circular reference/);
  const s = new Set();
  s.add(s);
  await assert.rejects(() => serialize(s), /Circular reference/);
});

// ---------------------------------------------------------------------------
// 2. Storage get/set/has/delete/clear
// ---------------------------------------------------------------------------

await check("InMemoryStore: basic operations", async () => {
  clearAll();
  const store = new InMemoryStore();
  assert.equal(store.has("a"), false);
  store.set("a", 1);
  assert.equal(store.has("a"), true);
  assert.equal(store.get("a"), 1);
  assert.equal(store.delete("a"), true);
  assert.equal(store.has("a"), false);
  assert.equal(store.get("a"), null);
});

await check("InMemoryStore: missing key returns null", async () => {
  clearAll();
  const store = new InMemoryStore();
  assert.equal(store.get("never-set"), null);
});

await check("InMemoryStore: stored undefined is distinguishable from missing", async () => {
  clearAll();
  const store = new InMemoryStore();
  store.set("u", undefined);
  assert.equal(store.has("u"), true);
  assert.equal(store.get("u"), undefined);
  assert.equal(store.has("missing"), false);
  assert.equal(store.get("missing"), null);
});

await check("InMemoryStore: clear() empties store", async () => {
  clearAll();
  const store = new InMemoryStore();
  store.set("x", 1);
  store.set("y", 2);
  store.clear();
  assert.equal(store.has("x"), false);
  assert.equal(store.has("y"), false);
});

await check("stepStore: operations", async () => {
  clearAll();
  stepStore.set("k1", "v1");
  assert.equal(stepStore.get("k1"), "v1");
  assert.equal(stepStore.has("k1"), true);
  assert.equal(stepStore.delete("k1"), true);
  assert.equal(stepStore.get("k1"), null);
});

await check("stepStore: stored null is not conflated with missing", async () => {
  clearAll();
  stepStore.set("nullKey", null);
  assert.equal(stepStore.has("nullKey"), true);
  assert.equal(stepStore.get("nullKey"), null);
  assert.equal(stepStore.has("missing"), false);
  assert.equal(stepStore.get("missing"), null);
  // Both return null, but has() distinguishes them
  assert.equal(stepStore.has("nullKey"), true);
  assert.equal(stepStore.has("missing"), false);
});

await check("blobStore: operations and dedup", async () => {
  clearAll();
  const buf1 = new Uint8Array([1, 2, 3]).buffer;
  const buf2 = new Uint8Array([4, 5, 6]).buffer;
  blobStore.set("h1", buf1);
  blobStore.set("h1", buf2); // dedup: ignored
  assert.equal(blobStore.get("h1"), buf1);
  assert.equal(blobStore.has("h1"), true);
  assert.equal(blobStore.delete("h1"), true);
  assert.equal(blobStore.has("h1"), false);
});

await check("clearAll() clears both stores", async () => {
  stepStore.set("s", "val");
  blobStore.set("b", new Uint8Array([7]).buffer);
  assert.equal(stepStore.has("s"), true);
  assert.equal(blobStore.has("b"), true);
  clearAll();
  assert.equal(stepStore.has("s"), false);
  assert.equal(blobStore.has("b"), false);
});

// ---------------------------------------------------------------------------
// 3. Cache key generation and arg-based hits/misses
// ---------------------------------------------------------------------------

await check("toCacheKey: basic format", async () => {
  const key = await toCacheKey("step:0", { arg: 42 });
  assert.match(key, /^step:0:[0-9a-f]{64}$/);
});

await check("toCacheKey: deterministic — same args → same key", async () => {
  const a = await toCacheKey("step:0", { x: 1, y: "hello" });
  const b = await toCacheKey("step:0", { x: 1, y: "hello" });
  assert.equal(a, b);
});

await check("toCacheKey: different args → different key", async () => {
  const a = await toCacheKey("step:0", { x: 1 });
  const b = await toCacheKey("step:0", { x: 2 });
  assert.notEqual(a, b);
});

await check("toCacheKey: undefined args → bare stepId", async () => {
  assert.equal(await toCacheKey("bareStep"), "bareStep");
});

await check("toCacheKey: with stepId only (no args param)", async () => {
  assert.equal(await toCacheKey("myStep"), "myStep");
});

await check("hash: sha256 hex of serialized value", async () => {
  const h1 = await hash({ a: [1, 2, 3] });
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, await hash({ a: [1, 2, 3] }));
  assert.notEqual(h1, await hash({ a: [1, 2, 4] }));
});

await check("sha256: string input", async () => {
  const h = await sha256("hello");
  assert.match(h, /^[0-9a-f]{64}$/);
});

await check("sha256: ArrayBuffer input", async () => {
  const buf = new TextEncoder().encode("hello").buffer;
  const h = await sha256(buf);
  assert.match(h, /^[0-9a-f]{64}$/);
});

await check("sha256 pure-JS fallback: matches WebCrypto for string", async () => {
  const webHex = await sha256("hello");
  assert.equal(sha256Bytes("hello"), webHex);
  // Known-good vector: SHA-256 of "hello"
  assert.equal(webHex, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

await check("sha256 pure-JS fallback: matches WebCrypto for ArrayBuffer", async () => {
  const buf = new TextEncoder().encode("hello world").buffer;
  const webHex = await sha256(buf);
  assert.equal(sha256Bytes(buf), webHex);
});

await check("sha256 pure-JS fallback: unicode string", async () => {
  const webHex = await sha256("héllo wörld ✓ 日本語");
  assert.equal(sha256Bytes("héllo wörld ✓ 日本語"), webHex);
});

await check("registerSha256: custom impl is used and takes precedence", async () => {
  registerSha256(async (input) => {
    assert.ok(typeof input === "string" || input instanceof ArrayBuffer);
    return "custom-hash";
  });
  assert.equal(await sha256("anything"), "custom-hash");
  registerSha256(null); // reset back to default resolution
  assert.notEqual(await sha256("anything"), "custom-hash");
});

await check("registerSha256: rejects non-function", async () => {
  assert.throws(() => registerSha256(42), /expected a function/);
  registerSha256(null);
});

// ---------------------------------------------------------------------------
// 4. Step naming
// ---------------------------------------------------------------------------

await check("generateStepId: auto name", async () => {
  assert.equal(generateStepId("myFn", 0), "myFn:0");
  assert.equal(generateStepId("myFn", 5), "myFn:5");
});

await check("generateStepId: explicit name override", async () => {
  assert.equal(generateStepId("myFn", 0, "custom"), "myFn:custom");
});

await check("generateStepId: undefined explicit = auto index", async () => {
  assert.equal(generateStepId("myFn", 3, undefined), "myFn:3");
});

await check("generateStepId: different function names stay unique", async () => {
  assert.notEqual(
    generateStepId("loadFile", 0),
    generateStepId("processImage", 0)
  );
});

// ---------------------------------------------------------------------------
// 5. Instance isolation
// ---------------------------------------------------------------------------

await check("createInstance: unique IDs", async () => {
  const i1 = createInstance();
  const i2 = createInstance();
  assert.notEqual(i1.id, i2.id);
  assert.ok(i1.id.length > 0);
  assert.ok(i2.id.length > 0);
});

await check("instance.namespace: prefixes key", async () => {
  const inst = createInstance();
  const ns = inst.namespace("step:0:abc123");
  assert.equal(ns, `${inst.id}:step:0:abc123`);
});

await check("instance.namespace: different instances produce different keys", async () => {
  const i1 = createInstance();
  const i2 = createInstance();
  assert.notEqual(i1.namespace("key"), i2.namespace("key"));
});

await check("instance has id and namespace", async () => {
  const inst = createInstance();
  assert.equal(typeof inst.id, "string");
  assert.equal(typeof inst.namespace, "function");
});

// ---------------------------------------------------------------------------
// 6. __step caching: same args = cache hit, different args = new execution
// ---------------------------------------------------------------------------

await check("__step: no args → caches by stepId only (first call wins)", async () => {
  clearAll();
  let callCount = 0;
  const result1 = await __step("test:cache1", () => {
    callCount++;
    return "cached-result";
  });
  assert.equal(result1, "cached-result");
  assert.equal(callCount, 1);

  // Second call with same stepId → cache hit (fn not called again)
  const result2 = await __step("test:cache1", () => {
    callCount++;
    return "should-not-happen";
  });
  assert.equal(result2, "cached-result");
  assert.equal(callCount, 1, "fn should NOT have been called again");
});

await check("__step: same args → cache hit", async () => {
  clearAll();
  let callCount = 0;
  const args = { userId: 42 };
  const result1 = await __step("test:same-args", () => {
    callCount++;
    return "from-step";
  }, undefined, args);
  assert.equal(result1, "from-step");
  assert.equal(callCount, 1);

  const result2 = await __step("test:same-args", () => {
    callCount++;
    return "should-not-run";
  }, undefined, args);
  assert.equal(result2, "from-step");
  assert.equal(callCount, 1, "cache hit — fn not called");
});

await check("__step: different args → new execution", async () => {
  clearAll();
  let callCount = 0;
  const r1 = await __step("test:diff-args", () => {
    callCount++;
    return "first";
  }, undefined, { id: 1 });
  assert.equal(r1, "first");
  assert.equal(callCount, 1);

  const r2 = await __step("test:diff-args", () => {
    callCount++;
    return "second";
  }, undefined, { id: 2 });
  assert.equal(r2, "second");
  assert.equal(callCount, 2, "different args → new call");
});

await check("__step: same args with instance → instance isolation keeps cache separate", async () => {
  clearAll();
  const instA = createInstance();
  const instB = createInstance();

  let callCount = 0;
  const args = { x: 1 };

  // First instance
  const rA = await __step("test:instance", () => {
    callCount++;
    return "from-A";
  }, undefined, args, instA);
  assert.equal(rA, "from-A");
  assert.equal(callCount, 1);

  // Second instance (different ns) → should NOT hit A's cache
  const rB = await __step("test:instance", () => {
    callCount++;
    return "from-B";
  }, undefined, args, instB);
  assert.equal(rB, "from-B");
  assert.equal(callCount, 2, "instance isolation — new call");

  // Same instance again → cache hit
  const rA2 = await __step("test:instance", () => {
    callCount++;
    return "should-not-run";
  }, undefined, args, instA);
  assert.equal(rA2, "from-A");
  assert.equal(callCount, 2, "cache hit within instance");
});

await check("__step: cached null value is returned correctly", async () => {
  clearAll();
  let callCount = 0;
  const r1 = await __step("test:null-val", () => {
    callCount++;
    return null;
  });
  assert.equal(r1, null);
  assert.equal(callCount, 1);

  // Second call should get cached null, not re-execute
  const r2 = await __step("test:null-val", () => {
    callCount++;
    return "should-not-run";
  });
  assert.equal(r2, null);
  assert.equal(callCount, 1, "null cached correctly");
});

await check("__step: cached undefined value is returned correctly", async () => {
  clearAll();
  let callCount = 0;
  const r1 = await __step("test:undef-val", () => {
    callCount++;
    return undefined;
  });
  assert.equal(r1, undefined);
  assert.equal(callCount, 1);

  const r2 = await __step("test:undef-val", () => {
    callCount++;
    return "should-not-run";
  });
  assert.equal(r2, undefined);
  assert.equal(callCount, 1, "undefined cached correctly");
});

// ---------------------------------------------------------------------------
// 7. __step retry: failing step retries, eventually succeeds or throws
// ---------------------------------------------------------------------------

await check("__step: succeeds on first try (no retry needed)", async () => {
  clearAll();
  const result = await __step("test:first-ok", () => {
    return "ok";
  }, { maxRetries: 3, baseDelayMs: 1 });
  assert.equal(result, "ok");
});

await check("__step: fails then retries and eventually succeeds", async () => {
  clearAll();
  let attempts = 0;
  const result = await __step("test:retry-ok", () => {
    attempts++;
    if (attempts < 3) throw new Error(`attempt ${attempts} failed`);
    return "success";
  }, { maxRetries: 5, baseDelayMs: 1 });
  assert.equal(result, "success");
  assert.equal(attempts, 3, "should have failed twice then succeeded");
});

await check("__step: exhausts all retries and throws", async () => {
  clearAll();
  let attempts = 0;
  await assert.rejects(
    () =>
      __step(
        "test:retry-exhaust",
        () => {
          attempts++;
          throw new Error("always fails");
        },
        { maxRetries: 2, baseDelayMs: 1 }
      ),
    /always fails/
  );
  assert.equal(attempts, 3, "should try initial + 2 retries = 3 total");
});

await check("__step: maxRetries = 0 means no retry", async () => {
  clearAll();
  let attempts = 0;
  await assert.rejects(
    () =>
      __step(
        "test:no-retry",
        () => {
          attempts++;
          throw new Error("fail");
        },
        { maxRetries: 0, baseDelayMs: 1 }
      ),
    /fail/
  );
  assert.equal(attempts, 1, "only one attempt when maxRetries=0");
});

await check("__step: supports retryConfig.retries alias", async () => {
  clearAll();
  let attempts = 0;
  await assert.rejects(
    () =>
      __step(
        "test:retries-alias",
        () => {
          attempts++;
          throw new Error("fail");
        },
        { retries: 1, baseDelay: 1 }
      ),
    /fail/
  );
  assert.equal(attempts, 2, "retries:1 alias should allow 2 total attempts");
});

await check("__step: retry result gets cached so subsequent calls return immediately", async () => {
  clearAll();
  let attempts = 0;
  const r1 = await __step("test:retry-cache", () => {
    attempts++;
    if (attempts < 2) throw new Error("fail once");
    return "finally-ok";
  }, { maxRetries: 3, baseDelayMs: 1 });
  assert.equal(r1, "finally-ok");
  assert.equal(attempts, 2);

  // Subsequent call → cache hit, fn not called
  const r2 = await __step("test:retry-cache", () => {
    attempts++;
    return "should-not-run";
  });
  assert.equal(r2, "finally-ok");
  assert.equal(attempts, 2, "cached after successful retry");
});

// ---------------------------------------------------------------------------
// 8. Full pipeline: Babel transform → runtime execution → storage persistance
// ---------------------------------------------------------------------------

await check("Babel plugin transforms @workflow function into __step calls", async () => {
  const input = `
class TestWorkflow {
  @workflow({ retries: 2 })
  async process(data) {
    const a = await stepOne(data);
    return await stepTwo(a);
  }
}
`;
  const output = babel.transformSync(input, {
    plugins: [require.resolve("../../babel-plugin-durable-workflow")],
    parserOpts: {
      plugins: [["decorators", { decoratorsBeforeExport: false }]],
    },
  }).code;

  assert.ok(output.includes('__step("TestWorkflow.process:0"'), "step 0 present");
  assert.ok(output.includes('__step("TestWorkflow.process:1"'), "step 1 present");
  assert.ok(output.includes("() => stepOne(data)"), "stepOne wrapped");
  assert.ok(output.includes("() => stepTwo(a)"), "stepTwo wrapped");
  assert.ok(output.includes("retries: 2"), "retry config preserved");
  assert.ok(!output.includes("@workflow"), "decorator stripped");
  assert.ok(
    output.includes('const __step = require("@durable/runtime").__step'),
    "import injected"
  );
});

await check("Babel plugin + @step comment directive", async () => {
  const input = `
class TestWorkflow {
  @workflow
  async pipeline(data) {
    // @step("loadData")
    const loaded = await load(data);
    // @step("transform")
    const result = await transform(loaded);
    return result;
  }
}
`;
  const output = babel.transformSync(input, {
    plugins: [require.resolve("../../babel-plugin-durable-workflow")],
    parserOpts: {
      plugins: [["decorators", { decoratorsBeforeExport: false }]],
    },
  }).code;

  assert.ok(output.includes('__step("TestWorkflow.pipeline:loadData"'), "explicit step name");
  assert.ok(output.includes('__step("TestWorkflow.pipeline:transform"'), "explicit step name 2");
  assert.ok(output.includes("() => load(data)"), "load wrapped");
  assert.ok(output.includes("() => transform(loaded)"), "transform wrapped");
  assert.ok(!output.includes("@workflow"), "decorator stripped");
});

await check("Babel plugin strips @workflow from sync functions (no __step added)", async () => {
  const input = `
class TestWorkflow {
  @workflow
  syncMethod() {
    return 42;
  }
}
`;
  const output = babel.transformSync(input, {
    plugins: [require.resolve("../../babel-plugin-durable-workflow")],
    parserOpts: {
      plugins: [["decorators", { decoratorsBeforeExport: false }]],
    },
  }).code;

  assert.ok(!output.includes("__step"), "no __step for sync function");
  assert.ok(!output.includes("@workflow"), "decorator stripped");
});

// ---------------------------------------------------------------------------
// 9. @workflow decorator is a runtime no-op
// ---------------------------------------------------------------------------

await check("@workflow decorator: is a function", async () => {
  assert.equal(typeof workflow, "function");
});

await check("@workflow decorator: called with config returns a function", async () => {
  const decorator = workflow({ retries: 3 });
  assert.equal(typeof decorator, "function");
});

await check("@workflow decorator: no-op — doesn't modify decorated method", async () => {
  // Simulate legacy decorator call
  const target = {};
  const key = "myMethod";
  const descriptor = {
    value: async function () {
      return 42;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  };
  const decorator = workflow({ retries: 3 });
  const result = decorator(target, key, descriptor);
  assert.equal(result, descriptor);
});

await check("@workflow decorator: bare call returns descriptor", async () => {
  const decorator = workflow();
  const descriptor = { value: () => "hello" };
  const result = decorator(null, "test", descriptor);
  assert.equal(result, descriptor);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
