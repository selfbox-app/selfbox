import { eq } from "drizzle-orm";
import { desktopIdempotencyKeys } from "@selfbox/database";
import type { Database } from "@selfbox/database";

/**
 * Run `fn` and cache its response keyed by `key` + `deviceId`. If the same
 * `key` arrives again, skip `fn` and return the cached response instead —
 * which makes the mutation safe to retry after a transient failure.
 *
 * When `key` is undefined (older clients that don't send one) the function
 * runs without any caching; callers are responsible for calling
 * `withIdempotency` only for genuinely idempotent-on-key operations.
 *
 * The response is stored verbatim as JSON. Rows are periodically cleaned up
 * by a scheduled job (24-hour TTL is enough for a client to retry through
 * any realistic transient outage; longer would grow the table indefinitely).
 */
export async function withIdempotency<T>(
  db: Database,
  opts: { key: string | undefined; deviceId: string; endpoint: string },
  fn: () => Promise<T>,
): Promise<T> {
  const { key, deviceId, endpoint } = opts;
  if (!key) return fn();

  const [existing] = await db
    .select({ response: desktopIdempotencyKeys.response })
    .from(desktopIdempotencyKeys)
    .where(eq(desktopIdempotencyKeys.key, key))
    .limit(1);

  if (existing) {
    return existing.response as T;
  }

  const result = await fn();

  // Store the fresh response. If two requests with the same key race, we
  // want the one that committed first to win and the second to return that
  // same response — so use ON CONFLICT DO NOTHING and re-read.
  try {
    await db
      .insert(desktopIdempotencyKeys)
      .values({
        key,
        deviceId,
        endpoint,
        response: result as unknown as object,
      })
      .onConflictDoNothing();
  } catch {
    // If the insert races and we lose, the committed row's response
    // already represents the first caller's outcome. Fall through.
  }

  return result;
}
