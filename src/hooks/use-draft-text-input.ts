import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";

type UseDraftTextInputOptions = {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
  isValid?: (value: string) => boolean;
  onInvalid?: () => void;
};

export function useDraftTextInput({
  value,
  onCommit,
  normalize = (nextValue) => nextValue,
  isValid = () => true,
  onInvalid,
}: UseDraftTextInputOptions) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const normalized = normalize(draft);
    if (!isValid(normalized)) {
      setDraft(value);
      onInvalid?.();
      return;
    }

    if (normalized !== value) {
      onCommit(normalized);
    }
  };

  const reset = () => setDraft(value);

  return {
    draft,
    setDraft,
    commit,
    reset,
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
        }
      },
      onBlur: commit,
    },
  };
}
