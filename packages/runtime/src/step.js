/**
 * __step — the core runtime function that provides caching, retry,
 * and durable execution for each workflow step.
 */
import { stepStore } from "./storage.js";
import { serialize, deserialize, toCacheKey } from "./serialize.js";

export async function __step(stepId, fn, retryConfig) {
  const cacheKey = stepId;

  const cached = stepStore.get(cacheKey);
  if (cached !== null) {
    return deserialize(cached);
  }

  const maxRetries = retryConfig?.maxRetries ?? 3;
  const baseDelay = retryConfig?.baseDelayMs ?? 100;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      const serialized = JSON.stringify(serialize(result));
      stepStore.set(cacheKey, serialized);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
