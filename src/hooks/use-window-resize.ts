import { useLayoutEffect, type DependencyList } from "react";

/**
 * Hook to handle window resize events.
 *
 * Uses useLayoutEffect to ensure callback runs synchronously after DOM mutations
 * and before browser paint, which is important for measuring layout.
 *
 * Calls the callback immediately on mount, then again on every resize.
 *
 * @param callback - Function to call on resize (and immediately on mount)
 * @param deps - Dependency list for useLayoutEffect
 *
 * @example
 * ```tsx
 * const [size, setSize] = useState({ width: 0, height: 0 });
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * const updateSize = useCallback(() => {
 *   if (containerRef.current) {
 *     const rect = containerRef.current.getBoundingClientRect();
 *     setSize({ width: rect.width, height: rect.height });
 *   }
 * }, []);
 *
 * useWindowResize(updateSize);
 * ```
 */
export function useWindowResize(
  callback: () => void,
  deps: DependencyList = [],
) {
  useLayoutEffect(() => {
    callback(); // Call immediately on mount
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }, deps);
}
