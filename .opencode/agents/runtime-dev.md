---
description: "Implements the runtime __step function (Section 1.2 of PLAN.md) — the core caching, retry, and execution engine."
mode: subagent
model: opencode/deepseek-v4-flash-free
reasoningEffort: medium
temperature: 0.1
max_steps: 20
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
---

You are implementing the runtime core for the durable workflow library.

## What to build (PLAN.md §1.2)

Create `packages/runtime/` with:

- `package.json`
- `src/index.ts` — exports `__step` function

The `__step(stepId, fn, retryConfig)` function must:

1. Capture the arguments passed to `fn` (via closure)
2. Serialize them using the serialization module
3. Compute `argHash = sha256(serialize(args))`
4. Cache key: `stepId:argHash`
5. Check storage for a completed result under that key
6. If found, return the deserialized result
7. If not, execute `fn()` with retry policy, serialize and store the result, return it

## Important

- After completing the implementation, run `git add -A && git commit -m "feat: implement runtime __step core"` to commit your work.
- Write clean, well-structured TypeScript.
