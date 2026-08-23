export type Result<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function toResult<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
