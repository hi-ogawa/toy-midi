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
      {/* Fixed positioning keeps clipping ancestors from cutting it off. The
      browser remembers a position fallback while the tooltip has a box, so it
      stays hidden until shown to choose its side from where the trigger is then. */}
      <span
        aria-hidden
        className="pointer-events-none fixed z-50 hidden mt-1 [position-anchor:--tooltip] [position-area:bottom] [position-try-fallbacks:flip-block] rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-neutral-100 tabular-nums shadow-lg group-focus-within/tooltip:block group-hover/tooltip:block"
      >
        {content}
      </span>
    </div>
  );
}
