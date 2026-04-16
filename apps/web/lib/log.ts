export function logFireAndForget(
  operation: string,
  context: Record<string, unknown> = {},
) {
  return (err: unknown) => {
    console.error(`[fire-and-forget] ${operation} failed`, {
      ...context,
      error: err instanceof Error ? err.message : String(err),
    });
  };
}
