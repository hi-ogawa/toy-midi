import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";

type UseDraftInputOptions = {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  parse?: "int" | "float";
  format?: (value: number) => string;
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
  parse = "int",
  format = String,
}: UseDraftInputOptions) {
  const [draft, setDraft] = useState(format(value));

  useEffect(() => {
    setDraft(format(value));
  }, [format, value]);

  const parseNumber = (text: string) =>
    parse === "float" ? Number.parseFloat(text) : Number.parseInt(text, 10);

  const commit = () => {
    const n = parseNumber(draft);
    if (!Number.isNaN(n)) {
      onCommit(clamp(n, min, max));
    } else {
      setDraft(format(value)); // Reset on invalid input
    }
  };

  const reset = () => setDraft(format(value));

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
        if (matchKeyboardEvent(e, "Enter")) {
          commit();
          e.currentTarget.blur();
        } else if (matchKeyboardEvent(e, "Escape")) {
          reset();
          e.currentTarget.blur();
        } else if (matchKeyboardEvent(e, "ArrowUp")) {
          e.preventDefault();
          increment();
        } else if (matchKeyboardEvent(e, "ArrowDown")) {
          e.preventDefault();
          decrement();
        }
      },
      onBlur: commit,
    },
  };
}
