import { describe, expect, test, vi } from "vitest";
import { createStore, shallowEqual } from "./store";

describe("createStore", () => {
  test("notifies a selector subscription only when its selection changes", () => {
    const store = createStore(() => ({ persisted: 1, transient: 1 }));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(
      (state) => ({ persisted: state.persisted }),
      listener,
      shallowEqual,
    );

    store.update({ transient: 2 });
    expect(listener).not.toHaveBeenCalled();

    store.update({ persisted: 2 });
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    store.update({ persisted: 3 });
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("shallowEqual", () => {
  test("compares values with Object.is", () => {
    const shared = {};

    expect(shallowEqual({ value: shared }, { value: shared })).toBe(true);
    expect(shallowEqual({ value: {} }, { value: {} })).toBe(false);
  });
});
