import { useEffect, useEffectEvent } from "react";

/**
 * Thin wrapper for window event listeners.
 * Uses useEffectEvent for stable callbacks - no deps needed.
 *
 * @example
 * ```tsx
 * useWindowEvent("keydown", (e) => {
 *   if (e.key === "Escape") {
 *     e.preventDefault();
 *     setOpen(false);
 *   }
 * });
 *
 * // With capture phase
 * useWindowEvent("keydown", handleKeyDown, true);
 * ```
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    window.addEventListener(type, onEvent, options);
    return () => window.removeEventListener(type, onEvent, options);
  }, []); // type and options assumed static
}
