import { useState } from "react";

export function useSetState<T>() {
  const [values, setValues] = useState<ReadonlySet<T>>(() => new Set());

  function setPresent({ value, present }: { value: T; present: boolean }) {
    setValues((current) => {
      const next = new Set(current);
      if (present) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  }

  return [values, setPresent] as const;
}
