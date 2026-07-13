---
description: "Implements the serialization module and cache key generation (Sections 1.3, 1.5 of PLAN.md)."
mode: subagent
model: opencode/hy3-free
reasoningEffort: low
temperature: 0.1
max_steps: 15
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
---

You are implementing the serialization module for the durable workflow library.

## What to build

### Serialization (PLAN.md §1.3)

Create `packages/runtime/src/serialize.ts`:

- `async serialize(value)` — walks the value tree (must be async because hashing and binary reads are async):
  - Primitives, null, undefined: included directly
  - `Date`: `{ __t: "d", v: ISO string }`
  - `File`: read as ArrayBuffer via `await value.arrayBuffer()` → hash via `await sha256(...)` → blob store → `{ __t: "f", h: "<sha256>", m: { name, type, lastModified } }`
  - `Blob`: same as File minus name/lastModified; use `await value.arrayBuffer()` (NOT `FileReaderSync`, which is Web Worker-only)
  - `ArrayBuffer`/`TypedArray`: hash via `await sha256(...)` → blob store → `{ __t: "b", h: "<sha256>" }`
  - `Map`: `{ __t: "m", v: [[k, v], ...] }` — recurse with `await serialize()`
  - `Set`: `{ __t: "s", v: [...] }` — recurse with `await serialize()`
  - `RegExp`: `{ __t: "r", v: "/pattern/flags" }`
  - `Error`: `{ __t: "e", v: { name, message, stack } }`
  - Plain objects/arrays: recurse with `await serialize()`
- `deserialize(value)` — reverses the process
- `async hash(value)` — SHA-256 of the serialized string (NOTE: the actual SHA-256 function is async; see hash.js)

### Cache Key (PLAN.md §1.5)

- Format: `stepId:sha256(serialize(args))`
- Example: `importFile:1:a1b2c3d4e5f6...`

## Important

- After completing, run `git add -A && git commit -m "feat: implement serialization module and cache key generation"` to commit.
- Handle edge cases: circular references, typed arrays, large binaries.
