# Agent Conventions & Lessons Learned

This file records cross-cutting patterns, conventions, and lessons that apply across multiple agents. It is read by the orchestrator and referenced by subagents.

## How This File Works

- If a problem is traced to **instructions in an agent `.md` file**, fix the `.md` file directly **AND** add a note here under "Cross-Cutting Patterns" so future agents learn from it.
- If a problem is traced to **instructions given in the orchestrator's prompt to a subagent** (not in any `.md` file), add a note here under "Prompt-Level Lessons" describing what went wrong and what to tell the orchestrator to do differently.
- If a pattern applies across all agents (e.g., "always handle circular references in serialization"), add it under "Cross-Cutting Patterns".
- Both sections serve the same purpose: prevent the same mistake from happening again. The split just distinguishes whether the fix lives in an agent `.md` file or in the orchestrator's prompt logic.

## Cross-Cutting Patterns

### Always `await` async `sha256` calls

The `sha256` function in `hash.js` is `async` and returns a `Promise<string>`. Any code that calls `sha256` must use `await`. This applies:

1. In `serialize.js` when hashing binary data (Blob, File, ArrayBuffer, TypedArray).
2. In `serialize.js` `toCacheKey` when computing the arg hash.
3. In any other module that calls `sha256`.

Failing to `await` causes the Promise object itself to be stored as a hash value (e.g., as a blob store key or in a serialized `__blobRef`/`h` field), which breaks deduplication and cache lookups.

If `serialize` needs to call `await sha256(...)`, it must be declared `async` itself, and all recursive `serialize` calls must also be awaited. See `serialization-dev.md` for the correct pattern.

### Use `Blob.arrayBuffer()` not `FileReaderSync`

When reading binary data from a `Blob` or `File`, use the async `await value.arrayBuffer()` method instead of `FileReaderSync`. `FileReaderSync` is only available in Web Workers and will throw in the main browser thread. The async approach works in all contexts and integrates naturally with the async `sha256` function.

### Storage `get` must distinguish missing keys from `undefined` values

The storage layer's `get(key)` method must distinguish between "key not found" (return `null`) and "key found with value `undefined`" (return `undefined`). Using `Map.get(key) ?? null` conflates these two cases because `Map.get` returns `undefined` for both missing keys and keys whose value is `undefined`. Instead, call `Map.has(key)` first — if the key exists, return `Map.get(key)` (which may be `undefined`); otherwise return `null`.

### Deserialization must reconstruct all types, not just extract data

When implementing `deserialize`, every type that has a special serialized form (type marker `__t`) must be reconstructed back to its original type, not just have its data extracted. This includes:
- `Blob` (`__t: "l"`): reconstruct as `new Blob([data], { type })` using the stored metadata
- `File` (`__t: "f"`): reconstruct as `new File([data], name, { type, lastModified })` using the stored metadata
- Returning raw `ArrayBuffer` instead of the reconstructed type breaks the contract that `deserialize(serialize(value))` is equivalent to `value`

The `serialization-dev.md` agent instructions must explicitly list every deserialization reversal, not just the serialization format. See the updated `serialization-dev.md` for the full pattern.

### Explicit step names must include the function name prefix

When implementing `generateStepId`, the explicit name from `// @step("customName")` overrides only the auto-generated suffix (N), not the entire step ID. The return format must be `${functionName}:${explicitName}` to avoid step ID collisions across different workflow functions.

The Babel plugin (`babel-plugin-dev`) generates `functionName:explicitName` for explicit steps. The `generateStepId` utility must produce the same format. See `naming-dev.md` for the correct pattern.

Agent `.md` files that define step naming must explicitly describe the explicit name format as `${functionName}:${explicitName}`.

### Guard `crypto.randomUUID` with `typeof crypto !== "undefined"`

The global `crypto` object is available in modern browsers and Node.js 16+, but may be undefined in some environments (older browsers, certain workers). Code that accesses `crypto.randomUUID` must first check `typeof crypto !== "undefined"` to avoid a `ReferenceError`. This applies:

1. In `instance.js` when generating UUID v4 instance IDs.
2. Any other code that references the global `crypto` object.

See `naming-dev.md` for the correct pattern.

## Prompt-Level Lessons

*(None yet — add entries when the orchestrator's prompt to a subagent causes a bug.)*
