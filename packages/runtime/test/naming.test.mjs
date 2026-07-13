/**
 * Tests for step naming and workflow instance isolation.
 * Run with: node packages/runtime/test/naming.test.mjs
 */
import assert from "node:assert/strict";
import { generateStepId } from "../src/step-naming.js";
import { createInstance } from "../src/instance.js";

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
// Step Naming Tests
// ---------------------------------------------------------------------------

await check("generateStepId with auto-generated name", async () => {
  const id = generateStepId("myFunction", 0);
  assert.equal(id, "myFunction:0");
});

await check("generateStepId with auto-generated name (index > 0)", async () => {
  const id = generateStepId("myFunction", 5);
  assert.equal(id, "myFunction:5");
});

await check("generateStepId with explicit name override", async () => {
  const id = generateStepId("myFunction", 0, "customStepName");
  assert.equal(id, "customStepName");
});

await check("generateStepId with explicit name (empty string)", async () => {
  const id = generateStepId("myFunction", 0, "");
  assert.equal(id, "");
});

await check("generateStepId with explicit name (null)", async () => {
  const id = generateStepId("myFunction", 0, null);
  assert.equal(id, null);
});

await check("generateStepId with explicit name (undefined)", async () => {
  const id = generateStepId("myFunction", 0, undefined);
  assert.equal(id, "myFunction:0");
});

// ---------------------------------------------------------------------------
// Workflow Instance Isolation Tests
// ---------------------------------------------------------------------------

await check("createInstance returns unique ID each time", async () => {
  const instance1 = createInstance();
  const instance2 = createInstance();
  assert.notEqual(instance1.id, instance2.id);
  assert.equal(typeof instance1.id, "string");
  assert.equal(typeof instance2.id, "string");
});

await check("createInstance returns valid UUID v4 format (when available)", async () => {
  const instance = createInstance();
  // Check if crypto.randomUUID is available (modern browsers/Node)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of 8, 9, A, or B
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.match(instance.id, uuidRegex);
  }
});

await check("instance.namespace correctly prefixes keys", async () => {
  const instance = createInstance();
  const key = "step1:argHash123";
  const namespaced = instance.namespace(key);
  assert.equal(namespaced, `${instance.id}:${key}`);
});

await check("instance.namespace with empty key", async () => {
  const instance = createInstance();
  const namespaced = instance.namespace("");
  assert.equal(namespaced, instance.id + ":");
});

await check("instance.namespace with key containing colons", async () => {
  const instance = createInstance();
  const key = "step:1:arg:hash";
  const namespaced = instance.namespace(key);
  assert.equal(namespaced, `${instance.id}:${key}`);
});

await check("instance has id and namespace methods", async () => {
  const instance = createInstance();
  assert.equal(typeof instance.id, "string");
  assert.equal(typeof instance.namespace, "function");
});

await check("multiple instances have different IDs", async () => {
  const instances = Array.from({ length: 10 }, () => createInstance());
  const ids = instances.map((i) => i.id);
  // All IDs should be unique
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length);
});

await check("instance.namespace preserves key structure", async () => {
  const instance = createInstance();
  const key = "stepId:argHash";
  const namespaced = instance.namespace(key);
  // Should be instanceId:stepId:argHash
  const parts = namespaced.split(":");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], instance.id);
  assert.equal(parts[1], "stepId");
  assert.equal(parts[2], "argHash");
});

console.log(`\n${passed} checks passed.`);