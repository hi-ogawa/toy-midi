import type { ReactNode } from "react";

export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group/tooltip relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-neutral-100 tabular-nums opacity-0 shadow-lg transition-opacity group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100"
      >
        {content}
      </span>
    </div>
  );
}
