---
description: "Implements the content-addressed blob store and storage layer (Sections 1.4, 1.6 of PLAN.md)."
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

You are implementing the storage layer for the durable workflow library.

## What to build

### Content-Addressed Blob Store (PLAN.md §1.4)

Create `packages/runtime/src/blob-store.ts`:

- Separate IndexedDB object store (or in-memory `Map`) for large binary data
- Keyed by SHA-256 hash
- Deduplicated: same content stored once
- When serializing args/results, large binary objects are:
  1. Read into `ArrayBuffer`
  2. Hashed
  3. Stored in blob store (if not already present)
  4. Replaced with lightweight `{ __blobRef: "<sha256>" }` reference

### Storage Layer (PLAN.md §1.6)

Create `packages/runtime/src/storage.ts`:

- Two IndexedDB object stores (or in-memory Maps):
  - `steps`: `stepId:argHash` → serialized result
  - `blobs`: `sha256` → `ArrayBuffer`
- Single database, two object stores
- In-memory fallback when IndexedDB is unavailable

## Important

- After completing, run `git add -A && git commit -m "feat: implement storage layer and blob store"` to commit.
- Export a clean `Storage` interface so it's pluggable.
