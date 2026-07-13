---
description: "Implements the Babel plugin (Section 1.1 of PLAN.md) — transforms `@workflow` decorated functions, replaces `await` with `__step` calls, and strips decorators."
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

You are implementing the Babel plugin for the durable client-side workflow library.

## What to build (PLAN.md §1.1)

Create `packages/babel-plugin-durable-workflow/` with:

- `package.json` — babel plugin package
- `src/index.js` or `src/index.ts` — the plugin

The plugin must:

1. Visit `@workflow(...)` decorators on:
   - Class methods
   - Standalone async function declarations
   - Standalone async function expressions (arrow or named)

2. For each decorated function:
   - Extract retry config from decorator arguments
   - Walk the AST, find all `AwaitExpression` nodes
   - Replace each `await <expr>` with `await __step("<stepId>", () => <expr>, <retryConfig>)`
   - Strip the `@workflow` decorator from output
   - Inject `__step` and the retry config into the function scope

3. Step ID format: `functionName:N` for standalone, `className.methodName:N` for class methods

4. Support `// @step("name")` comment directive as explicit naming fallback

## Important

- After completing the implementation, run `git add -A && git commit -m "feat: implement babel-plugin-durable-workflow"` to commit your work.
- Write clear, production-quality code with proper error handling.
