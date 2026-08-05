import { expect, it, vi } from "vitest";
import { memo } from "./memo";

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
