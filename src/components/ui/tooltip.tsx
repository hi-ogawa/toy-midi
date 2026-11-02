import type { ReactNode } from "react";

export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group/tooltip [anchor-name:--tooltip] [anchor-scope:--tooltip]">
      {children}
      {/* Fixed positioning keeps clipping ancestors from cutting it off. */}
      <span
        aria-hidden
        className="pointer-events-none fixed z-50 mt-1 [position-anchor:--tooltip] [position-area:bottom] rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-neutral-100 tabular-nums opacity-0 shadow-lg transition-opacity group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100"
      >
        {content}
      </span>
    </div>
  );
}
