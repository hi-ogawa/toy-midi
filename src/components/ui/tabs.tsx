import { type KeyboardEvent, type ReactNode, useId } from "react";

export function Tabs<T extends string>({
  label,
  options,
  value,
  onValueChange,
  children,
}: {
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (value: T) => void;
  children: ReactNode;
}) {
  const id = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = tabs.findIndex((tab) => tab === event.target);
    if (index === -1) {
      return;
    }

    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft": {
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      }
      case "ArrowRight": {
        nextIndex = (index + 1) % options.length;
        break;
      }
      case "Home": {
        nextIndex = 0;
        break;
      }
      case "End": {
        nextIndex = options.length - 1;
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
    onValueChange(options[nextIndex].value);
    tabs[nextIndex].focus();
  };

  return (
    <>
      <div
        role="tablist"
        onKeyDown={handleKeyDown}
        aria-label={label}
        className="mb-5 flex gap-2 border-b border-neutral-700/70"
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel`}
            aria-selected={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className="relative -mb-px inline-flex min-w-36 items-center justify-center gap-2.5 rounded-t-lg border-b-2 border-transparent px-5 py-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-neutral-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 aria-selected:border-emerald-400 aria-selected:bg-emerald-400/5 aria-selected:text-emerald-300"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selectedIndex}`}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
