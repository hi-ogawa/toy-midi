import { useCallback, useEffectEvent } from "react";

/**
 * Returns a ref callback for element event listeners.
 * Uses React 19 ref cleanup and useEffectEvent for stable callbacks.
 *
 * @example
 * ```tsx
 * const wheelRef = useElementEvent("wheel", (e) => {
 *   e.preventDefault();
 *   handleZoom(e.deltaY);
 * }, { passive: false });
 *
 * <div ref={wheelRef} />
 *
 * // For multiple events on same element, use mergeRefs:
 * const clickRef = useElementEvent("click", handleClick);
 * <div ref={mergeRefs(wheelRef, clickRef)} />
 * ```
 */
export function useElementEvent<K extends keyof HTMLElementEventMap>(
  type: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  const onEvent = useEffectEvent(handler);

  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.addEventListener(type, onEvent, options);
    return () => el.removeEventListener(type, onEvent, options);
  }, []); // type and options assumed static
}
