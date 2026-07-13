/**
 * __step — the core runtime function that provides caching, retry,
 * and durable execution for each workflow step.
 *
 * @param {string} stepId - Stable identifier for the step (e.g. "ClassName.methodName:0")
 * @param {Function} fn - Thunk wrapping the step expression: () => <expr>
 * @param {Object} [retryConfig] - Optional retry policy
 * @param {number} [retryConfig.maxRetries] - Max retries (alias: retries)
 * @param {number} [retryConfig.baseDelayMs] - Base delay in ms (alias: baseDelay)
 * @param {*} [args] - Arguments to fn for cache key computation (optional)
 * @param {Object} [instance] - Workflow instance for key namespacing (optional)
 */
const { stepStore } = require("./storage.js");
const { serialize, deserialize, toCacheKey } = require("./serialize.js");

async function __step(stepId, fn, retryConfig, args, instance) {
  // Build cache key: stepId[:argHash][:instanceId]
  let cacheKey = stepId;
  if (args !== undefined) {
    cacheKey = await toCacheKey(stepId, args);
  }
  if (instance && instance.namespace) {
    cacheKey = instance.namespace(cacheKey);
  }

  // Check for cached result
  // Use has() instead of get() to correctly handle cached null values
  // (serialize(null) returns null, which is a valid cached result).
  if (stepStore.has(cacheKey)) {
    return deserialize(stepStore.get(cacheKey));
  }

  // Normalize retry config — support both naming conventions
  const maxRetries = retryConfig?.maxRetries ?? retryConfig?.retries ?? 3;
  const baseDelayMs = retryConfig?.baseDelayMs ?? retryConfig?.baseDelay ?? 100;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      // Store serialized result (deserialize reverses this)
      stepStore.set(cacheKey, await serialize(result));
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

module.exports = { __step };
