import { expect, test, vi } from "vitest";
import { createStore, shallowEqual } from "./store";

test("subscribeWithSelector notifies only when the selection changes", () => {
  const store = createStore(() => ({ persisted: 1, transient: 1 }));
  const listener = vi.fn();
  const unsubscribe = store.subscribeWithSelector({
    selector: (state) => ({ persisted: state.persisted }),
    listener,
    equals: shallowEqual,
  });

  store.update({ transient: 2 });
  expect(listener).not.toHaveBeenCalled();

  store.update({ persisted: 2 });
  expect(listener).toHaveBeenCalledOnce();

  unsubscribe();
  store.update({ persisted: 3 });
  expect(listener).toHaveBeenCalledOnce();
});
