---
description: "Implements step naming and workflow instance isolation (Sections 1.7, 1.8 of PLAN.md)."
mode: subagent
model: opencode/north-mini-code-free
reasoningEffort: low
temperature: 0.1
max_steps: 10
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
---

You are implementing step naming and instance isolation for the durable workflow library.

## What to build

### Step Naming (PLAN.md §1.7)

Create `packages/runtime/src/step-naming.js`:

- Auto-generated: `functionName:N` (or `className.methodName:N` for class methods)
- Explicit: `// @step("customName")` comment directive overrides auto-generated names. The explicit name replaces the auto-generated suffix N but **keeps the functionName prefix** to avoid step ID collisions across different workflow functions. Format: `${functionName}:${explicitName}`.
- Export `generateStepId(functionName, index, explicitName?)`

### Workflow Instance Isolation (PLAN.md §1.8)

Create `packages/runtime/src/instance.js`:

- Each call to a workflow function creates a new workflow instance with a unique instance ID
- Storage keys are namespaced by instance ID: `instanceId:stepId:argHash`
- Instance ID uses `crypto.randomUUID()` when available, with a fallback for environments where `crypto` is not defined. **Must check `typeof crypto !== "undefined"`** before accessing `crypto.randomUUID`.
- Export `createInstance(): { id: string; namespace(key: string): string }`

## Important

- Write tests for all functions (step naming and instance isolation) in `packages/runtime/test/naming.test.mjs`.
- Ensure `packages/runtime/src/index.js` exports `createInstance` from `./instance.js` and `generateStepId` from `./step-naming.js` — add those export lines if they are not already present.
- After completing, run `git add -A && git commit -m "feat: implement step naming and instance isolation"` to commit.
