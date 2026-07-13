/**
 * Workflow instance isolation — each call gets a unique instance ID
 * and all storage keys are namespaced under it.
 */

let counter = 0;

export function createInstance() {
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    namespace(key) {
      return `${id}:${key}`;
    },
  };
}
