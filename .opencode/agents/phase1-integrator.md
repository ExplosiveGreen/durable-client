---
description: "Integrates all Phase 1 components, writes the main entry point, creates tests, and verifies everything works end-to-end."
mode: subagent
model: opencode/deepseek-v4-flash-free
reasoningEffort: medium
temperature: 0.1
max_steps: 25
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
---

You are integrating Phase 1 of the durable client-side workflow library.

## Your Job

1. Read all existing source files in `packages/`
2. Create `packages/runtime/src/index.ts` that re-exports everything with a clean public API
3. Create the `@workflow` decorator function that users apply to their functions
4. Create a demonstration/test workflow to verify the full pipeline works
5. Write comprehensive tests for:
   - Babel plugin output correctness
   - Serialization round-trip for all types
   - Storage get/set/has/delete
   - Cache key generation
   - Step naming
   - Instance isolation
6. Run the tests and fix any failures
7. Verify the Babel plugin can transform a sample file end-to-end

## Important

- After completing, run `git add -A && git commit -m "feat: integrate Phase 1 with entry point and tests"` to commit.
- Make sure the API surface is clean and minimal (Design Principle #1).
