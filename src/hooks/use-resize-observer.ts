import { useCallback } from "react";

export function useResizeObserver(onResize: (element: HTMLElement) => void) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      const observer = new ResizeObserver(() => onResize(element));
      observer.observe(element);
      onResize(element);
      return () => observer.disconnect();
    },
    [onResize],
  );
}
