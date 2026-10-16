import { expect, it, vi } from "vitest";
import { memo, memoAsync } from "./memo";

it("memoizes results by input", () => {
  const compute = vi.fn((input: string) =>
    input === "missing" ? undefined : input.length,
  );
  const memoized = memo(compute);

  expect(memoized("value")).toBe(5);
  expect(memoized("value")).toBe(5);
  expect(memoized("missing")).toBeUndefined();
  expect(memoized("missing")).toBeUndefined();
  expect(compute).toHaveBeenCalledTimes(2);
});

it("shares a pending result and retries after a rejection", async () => {
  let attempt = 0;
  const load = vi.fn(async (input: string) => {
    attempt++;
    if (attempt === 1) {
      throw new Error("offline");
    }
    return `${input} ${attempt}`;
  });
  const memoized = memoAsync(load);

  await expect(memoized("font")).rejects.toThrow("offline");
  const [first, second] = await Promise.all([
    memoized("font"),
    memoized("font"),
  ]);
  expect(first).toBe("font 2");
  expect(second).toBe("font 2");
  expect(await memoized("font")).toBe("font 2");
  expect(load).toHaveBeenCalledTimes(2);
});
