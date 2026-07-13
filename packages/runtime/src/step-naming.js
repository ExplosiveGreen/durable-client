/**
 * Generate a step ID from function/class name and await index.
 * Supports explicit naming via optional override.
 */
export function generateStepId(functionName, index, explicitName) {
  if (explicitName !== undefined) return explicitName;
  return `${functionName}:${index}`;
}
