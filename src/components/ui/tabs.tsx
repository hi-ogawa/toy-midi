import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ReactNode } from "react";

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
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(nextValue) => {
        const option = options.find((option) => option.value === nextValue);
        if (option) {
          onValueChange(option.value);
        }
      }}
    >
      <TabsPrimitive.List
        aria-label={label}
        className="mb-5 flex gap-2 border-b border-neutral-700/70"
      >
        {options.map((option) => (
          <TabsPrimitive.Trigger
            key={option.value}
            value={option.value}
            className="relative -mb-px inline-flex min-w-36 items-center justify-center gap-2.5 rounded-t-lg border-b-2 border-transparent px-5 py-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-neutral-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 aria-selected:border-emerald-400 aria-selected:bg-emerald-400/5 aria-selected:text-emerald-300"
          >
            {option.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {options.map((option) => (
        <TabsPrimitive.Content key={option.value} value={option.value}>
          {value === option.value && children}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
