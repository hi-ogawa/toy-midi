import { useCallback, useEffectEvent } from "react";

export function useResizeObserver(onResize: (element: HTMLElement) => void) {
  const handleResize = useEffectEvent(onResize);
  return useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => handleResize(element));
    observer.observe(element);
    handleResize(element);
    return () => observer.disconnect();
  }, []);
}
