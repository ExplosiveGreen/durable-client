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

Create `packages/runtime/src/step-naming.ts`:

- Auto-generated: `functionName:N` (or `className.methodName:N` for class methods)
- Explicit: `// @step("customName")` comment directive overrides auto-generated names
- Export `generateStepId(functionName: string, index: number, explicitName?: string): string`

### Workflow Instance Isolation (PLAN.md §1.8)

Create `packages/runtime/src/instance.ts`:

- Each call to a workflow function creates a new workflow instance with a unique instance ID
- Storage keys are namespaced by instance ID: `instanceId:stepId:argHash`
- Instance ID is auto-generated (UUID v4) per call
- Export `createInstance(): { id: string; namespace(key: string): string }`

## Important

- After completing, run `git add -A && git commit -m "feat: implement step naming and instance isolation"` to commit.
