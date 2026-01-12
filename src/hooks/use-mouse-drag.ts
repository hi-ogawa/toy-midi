import { useEffect, type DependencyList } from "react";

/**
 * Options for mouse drag handler
 */
export type MouseDragOptions = {
  /** Callback when mouse moves during drag */
  onMove?: (e: MouseEvent) => void;
  /** Callback when drag ends (mouseup) */
  onEnd?: (e: MouseEvent) => void;
  /** Whether dragging is active */
  enabled: boolean;
};

/**
 * Hook to handle mouse drag operations (mousemove + mouseup on window).
 *
 * Listens to window events when enabled, useful for drag operations that
 * should continue even if mouse leaves the original element.
 *
 * @param options - Configuration for mouse drag behavior
 * @param deps - Dependency list for useEffect
 *
 * @example
 * ```tsx
 * const [isDragging, setIsDragging] = useState(false);
 *
 * const handleMouseMove = useCallback((e: MouseEvent) => {
 *   // Update position based on e.clientX, e.clientY
 * }, []);
 *
 * const handleMouseUp = useCallback(() => {
 *   setIsDragging(false);
 * }, []);
 *
 * useMouseDrag({
 *   enabled: isDragging,
 *   onMove: handleMouseMove,
 *   onEnd: handleMouseUp,
 * }, [isDragging, handleMouseMove, handleMouseUp]);
 *
 * // Start drag on mousedown
 * <div onMouseDown={() => setIsDragging(true)}>Drag me</div>
 * ```
 */
export function useMouseDrag(
  options: MouseDragOptions,
  deps: DependencyList = [],
) {
  useEffect(() => {
    if (!options.enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      options.onMove?.(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      options.onEnd?.(e);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [options.enabled, ...deps]);
}
