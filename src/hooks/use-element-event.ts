import { useEffect, type DependencyList, type RefObject } from "react";

/**
 * Hook to attach an event listener to a DOM element via ref.
 *
 * Generic over event types for type safety.
 *
 * @param ref - React ref to the element
 * @param eventType - Type of event to listen for
 * @param handler - Event handler function
 * @param options - Event listener options (capture, passive, etc.)
 * @param deps - Dependency list for useEffect
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * const handleWheel = useCallback((e: WheelEvent) => {
 *   e.preventDefault();
 *   // Handle wheel event
 * }, []);
 *
 * useElementEvent(
 *   containerRef,
 *   "wheel",
 *   handleWheel,
 *   { passive: false },
 *   [handleWheel]
 * );
 * ```
 */
export function useElementEvent<
  E extends HTMLElement | null,
  K extends keyof HTMLElementEventMap,
>(
  ref: RefObject<E>,
  eventType: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
  deps: DependencyList = [],
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const eventHandler = handler as EventListener;
    element.addEventListener(eventType, eventHandler, options);
    return () => element.removeEventListener(eventType, eventHandler, options);
  }, [ref, eventType, options, ...deps]);
}
