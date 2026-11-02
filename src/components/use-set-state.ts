import { useState } from "react";

export function useSetState<T>() {
  const [set, setSet] = useState<ReadonlySet<T>>(new Set());

  function add(item: T) {
    setSet((current) => new Set(current).add(item));
  }

  function remove(item: T) {
    setSet((current) => {
      const next = new Set(current);
      next.delete(item);
      return next;
    });
  }

  function toggle(item: T) {
    setSet((current) => {
      const next = new Set(current);
      if (!next.delete(item)) {
        next.add(item);
      }
      return next;
    });
  }

  return [set, { add, remove, toggle, replace: setSet }] as const;
}
