import { useEffect, useState } from "react";

type UseDraftInputOptions = {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hook for numeric inputs that only commit on Enter or blur.
 * Supports arrow keys and increment/decrement for fine control.
 *
 * @example
 * ```tsx
 * const bpmInput = useDraftInput({
 *   value: tempo,
 *   onCommit: setTempo,
 *   min: 30,
 *   max: 300,
 *   step: 1,
 * });
 *
 * <input type="text" inputMode="numeric" {...bpmInput.props} />
 * ```
 */
export function useDraftInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
}: UseDraftInputOptions) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (!Number.isNaN(n)) {
      onCommit(clamp(n, min, max));
    } else {
      setDraft(String(value)); // Reset on invalid input
    }
  };

  const reset = () => setDraft(String(value));

  const increment = () => onCommit(clamp(value + step, min, max));
  const decrement = () => onCommit(clamp(value - step, min, max));

  return {
    draft,
    setDraft,
    commit,
    reset,
    increment,
    decrement,
    props: {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          reset();
          e.currentTarget.blur();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          increment();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          decrement();
        }
      },
      onBlur: commit,
    },
  };
}
