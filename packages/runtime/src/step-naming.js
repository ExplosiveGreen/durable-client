/**
 * Generate a step ID from function/class name and await index.
 * Supports explicit naming via optional override.
 */
export function generateStepId(functionName, index, explicitName) {
  // explicitName comes from a `// @step("customName")` comment directive.
  // It overrides the auto-generated suffix (N) but keeps the functionName prefix
  // so step IDs remain unique across different workflow functions:
  //   auto:    "functionName:0"
  //   explicit: "functionName:customName"
  if (explicitName !== undefined) return `${functionName}:${explicitName}`;
  return `${functionName}:${index}`;
}
