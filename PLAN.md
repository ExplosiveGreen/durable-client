# Durable Client-Side Workflow Library — Plan

## Overview

A library for durable client-side workflows where the device performs meaningful work (local processing, storage operations, data transformation, media processing, parsing, indexing, importing/exporting). Workflows are written as normal async code with a `@workflow` decorator; the compiler transforms `await` expressions into durable steps with retry policies and content-addressed caching.

---

## Design Principles

1. **Minimal surface area** — The library should feel invisible. Developers write normal async code; durability is added declaratively.
2. **Progressive enhancement** — Start with retries and step durability. Add recovery, timeouts, and tooling later.
3. **No build step required for consumers** — The Babel plugin is a dev dependency. The output is plain JS that works in any `<script>` tag.
4. **Storage is an implementation detail** — The core library delegates to a pluggable storage interface.
5. **Deterministic step IDs** — Step IDs are stable across executions so partial progress can be resumed.

---

## Phase 1 — Compiler + Runtime Core (MVP)

### 1.1 Babel Plugin (`babel-plugin-durable-workflow`)

- Visits `@workflow(...)` on:
  - Class methods.
  - Standalone async function declarations.
  - Standalone async function expressions (arrow or named).
- For each decorated function:
  1. Extracts the retry config from the decorator arguments.
  2. Walks the AST, finds all `AwaitExpression` nodes.
  3. Replaces each `await <expr>` with `await __step("<stepId>", () => <expr>, <retryConfig>)`.
  4. Strips the `@workflow` decorator from output.
  5. Injects `__step` and the retry config into the function scope.
- Step IDs: `functionName:N` for standalone functions, `className.methodName:N` for class methods.
- The `// @step("name")` comment directive is a fallback for explicit naming — the compiler auto-detects steps without it.

### 1.2 Runtime (`@durable/runtime`)

**`__step(stepId, fn, retryConfig)` — core function:**
- Captures the arguments passed to `fn` (via the closure).
- Serializes them using the serialization module.
- Computes `argHash = sha256(serialize(args))`.
- Cache key: `stepId:argHash`.
- Checks storage for a completed result under that key.
- If found, returns the deserialized result.
- If not, executes `fn()` with retry, serializes and stores the result, returns it.

### 1.3 Serialization Module
- `serialize(value)` — walks the value tree:
  - Primitives: included directly.
  - `null`/`undefined`: included directly.
  - `Date`: `{ __t: "d", v: ISO string }`.
  - `File`: read as ArrayBuffer → hash → store in blob store → `{ __t: "f", h: "<sha256>", m: { name, type, lastModified } }`.
  - `Blob`: same as File (minus name/lastModified).
  - `ArrayBuffer`/`TypedArray`: hash → blob store → `{ __t: "b", h: "<sha256>" }`.
  - `Map`: `{ __t: "m", v: [[k, v], ...] }`.
  - `Set`: `{ __t: "s", v: [...] }`.
  - `RegExp`: `{ __t: "r", v: "/pattern/flags" }`.
  - `Error`: `{ __t: "e", v: { name, message, stack } }`.
  - Plain objects/arrays: recurse.
  - Primitives: included directly.
- `deserialize(value)` — reverses the process, reconstructing objects from type markers and blob refs.
- `hash(value)` — SHA-256 of the serialized string.

### 1.4 Content-Addressed Blob Store
- Separate IndexedDB object store (or in-memory `Map`) for large binary data.
- Keyed by SHA-256 hash.
- Deduplicated: same content stored once regardless of how many steps reference it.
- When serializing args/results, large binary objects are:
  1. Read into `ArrayBuffer`.
  2. Hashed.
  3. Stored in blob store (if not already present).
  4. Replaced with a lightweight `{ __blobRef: "<sha256>" }` reference.
- The cache key is then just `stepId:sha256(compactSerializedString)` — always small and fixed-size.

### 1.5 Cache Key Generation
- `stepId:sha256(serialize(args))`
- The serialized args string is compact because large objects are replaced with short blob refs.
- Example: `importFile:1:a1b2c3d4e5f6...` (64-char hex hash).

### 1.6 Storage Layer
- Two IndexedDB object stores (or in-memory Maps):
  - `steps`: `stepId:argHash` → serialized result.
  - `blobs`: `sha256` → `ArrayBuffer`.
- Single database, two object stores.
- In-memory fallback when IndexedDB is unavailable.

### 1.7 Step Naming
- Auto-generated: `functionName:N` (or `className.methodName:N` for class methods).
- Explicit: `// @step("customName")` comment directive as fallback for overriding auto-generated names.

### 1.8 Workflow Instance Isolation
- Each call to a workflow function creates a new workflow instance with a unique instance ID.
- Storage keys are namespaced by instance ID: `instanceId:stepId:argHash`.
- Instance ID is auto-generated (UUID v4) per call.
- This allows concurrent calls to the same function without state collision.

---

## Phase 2 — Resilience & Recovery

**2.1 Crash Recovery**
- On workflow start, check storage for partial progress (incomplete step sequence).
- Resume from the first uncompleted step rather than starting over.
- Detect stale/incomplete workflow state and clean up.

**2.2 Step Timeouts**
- Each step can have an optional timeout. If a step exceeds its timeout, it is retried (per the retry policy) or the workflow fails.

**2.3 Workflow-Level Timeout**
- An overall timeout for the entire workflow. If exceeded, the workflow is aborted and state is cleaned up.

---

## Phase 3 — Developer Experience

**3.1 Explicit `@step` Comment Directives**
- `// @step("customName")` before an `await` expression overrides the auto-generated step name.
- The Babel plugin reads these comments and uses the provided name instead of the auto-generated one.

**3.2 Lifecycle Hooks**
- `onStepStart(instanceId, stepId, args)`
- `onStepComplete(instanceId, stepId, result)`
- `onStepRetry(instanceId, stepId, error, attempt)`
- `onStepFail(instanceId, stepId, error)`
- `onWorkflowComplete(instanceId)`
- `onWorkflowFail(instanceId, error)`
- Passed via `@workflow({ ..., hooks: { ... } })`.

**3.3 Progress Reporting**
- Emit progress events with step counts, estimated completion, and elapsed time.

---

## Phase 4 — Advanced Features

**4.1 Pluggable Storage Adapters**
- Interface: `{ get(key), set(key, value), delete(key), has(key), clear() }`.
- Built-in adapters: IndexedDB, in-memory, localStorage (for small data), OPFS (for large data).
- Custom adapters for Electron, Tauri, Node.js.

**4.2 Sub-Workflows**
- Allow one workflow to call another as a sub-workflow.
- Sub-workflow results are persisted and recoverable independently.

**4.3 Serialization Hooks**
- Allow users to register custom serializers for their own types.
- `registerSerializer(typeTag, { serialize, deserialize })`.

---

## Phase 3 — Developer Experience

**3.1 Lifecycle Hooks**
- `onStepStart(instanceId, stepId, args)`
- `onStepComplete(instanceId, stepId, result)`
- `onStepRetry(instanceId, stepId, error, attempt)`
- `onStepFail(instanceId, stepId, error)`
- `onWorkflowComplete(instanceId)`
- `onWorkflowFail(instanceId, error)`
- Passed via `@workflow({ ..., hooks: { ... } })`.

**3.2 Progress Reporting**
- Emit progress events with step counts, estimated completion, and elapsed time.

---

## Phase 4 — Advanced Features

**4.1 Pluggable Storage Adapters**
- Interface: `{ get(key), set(key, value), delete(key), has(key), clear() }`.
- Built-in adapters: IndexedDB, in-memory, localStorage (for small data), OPFS (for large data).
- Custom adapters for Electron, Tauri, Node.js.

**4.2 Sub-Workflows**
- Allow one workflow to call another as a sub-workflow.
- Sub-workflow results are persisted and recoverable independently.

**4.3 Serialization Hooks**
- Allow users to register custom serializers for their own types.
- `registerSerializer(typeTag, { serialize, deserialize })`.

---

## Phase 5 — Developer Tooling

**5.1 Workflow Inspector / DevTools**
- A browser extension or embedded panel that shows:
  - Active workflows and their current step.
  - Step history with timing, retries, and errors.
  - Stored state inspection.

**5.2 Logging & Telemetry**
- Structured logging for each step execution.
- Optional integration with observability backends.

**5.3 Testing Utilities**
- Helpers to simulate crashes, retries, and step failures in tests.
- Mock storage backend for deterministic testing.

---

## Phase 6 — Production Hardening

**6.1 Storage Quota Management**
- Monitor storage usage and evict old/complete workflow state.
- Configurable max storage per workflow.

**6.2 Error Classification**
- Distinguish between retryable errors (network, timeout) and fatal errors (invalid input, permission denied).
- Allow custom error classifiers.

**6.3 Serialization Safety**
- Deep-check step inputs and outputs for serializability.
- Provide hooks for custom serialization of complex types.

---

## Phase 7 — Ecosystem

**7.1 Framework Integrations**
- Optional adapters for React, Vue, Svelte, Angular (reactive state binding, progress display).
- Electron / Tauri adapters for file-system-backed storage.

**7.2 Workflow Visualization**
- Generate a static graph of workflow steps from source code analysis.
- Runtime visualization of active workflows.

**7.3 CLI Scaffolding**
- `npx create-durable-workflow` to scaffold a new project.
- Code generation for common workflow patterns.
