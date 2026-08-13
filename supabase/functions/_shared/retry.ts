/** Retries an operation that returns a Supabase-style `{ error }` result up to `maxAttempts`
 * times with exponential backoff (500ms, 1000ms, 2000ms), returning the last result either way
 * -- the caller decides what "still failing after retries" means for them. Used for
 * compensation steps (deleting an auth user, cascading a clinic delete) where a transient
 * failure must not silently leave orphaned records behind. */
export async function retryWithBackoff<T extends { error: unknown }>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let result: T;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await fn();
    if (!result.error) return result;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  return result!;
}
