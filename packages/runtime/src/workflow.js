/**
 * @workflow decorator — runtime no-op.
 *
 * At compile time the Babel plugin (babel-plugin-durable-workflow) strips
 * this decorator and transforms await expressions inside the decorated
 * function into __step() calls. At runtime this is a pass-through so that
 * source code referencing @workflow compiles without errors even when the
 * Babel plugin is not active (e.g. in test/dev environments).
 *
 * Usage:
 *   import { workflow } from "@durable/runtime";
 *
 *   class MyWorkflows {
 *     @workflow({ retries: 3 })
 *     async process(data) {
 *       const a = await step1(data);
 *       return await step2(a);
 *     }
 *   }
 *
 * The config object (retries, baseDelay, etc.) is used by the Babel plugin
 * to populate the retry policy — the runtime decorator ignores it.
 */
export function workflow(config) {
  // Return a no-op decorator.  The function signature matches the legacy
  // (stage 1) decorator proposal, which is what @babel/plugin-proposal-decorators
  // with `decoratorsBeforeExport: false` produces.
  return function workflowDecorator(target, key, descriptor) {
    // descriptor is a PropertyDescriptor for method decorators.
    // For function declarations / expressions Babel may pass the function
    // itself as target — we return it unchanged in every case.
    return descriptor !== undefined ? descriptor : target;
  };
}
