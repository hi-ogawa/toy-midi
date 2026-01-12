import { useEffect, type DependencyList } from "react";

/**
 * Options for keyboard shortcut configuration
 */
export type KeyboardShortcutOptions = {
  /** The key value (e.g., "Enter", "Escape") */
  key?: string;
  /** The key code (e.g., "Space", "KeyF") */
  code?: string;
  /** Whether Ctrl key must be pressed */
  ctrl?: boolean;
  /** Whether Meta/Cmd key must be pressed */
  meta?: boolean;
  /** Whether Shift key must be pressed */
  shift?: boolean;
  /** Whether Alt key must be pressed */
  alt?: boolean;
  /** Whether to preventDefault on the event */
  preventDefault?: boolean;
  /** Whether to stopPropagation on the event */
  stopPropagation?: boolean;
  /** Use capture phase for event listener */
  capture?: boolean;
  /** Ignore events when typing in inputs (default: true) */
  ignoreInputs?: boolean;
  /** Whether the shortcut is enabled (default: true) */
  enabled?: boolean;
  /** Prevent repeated events when key is held down (default: false) */
  preventRepeat?: boolean;
};

/**
 * Hook to register a keyboard shortcut with flexible conditions.
 *
 * @param options - Configuration for the keyboard shortcut
 * @param callback - Function to call when shortcut is triggered
 * @param deps - Dependency list for useEffect (callback should be in deps if not memoized)
 *
 * @example
 * ```tsx
 * // Simple shortcut
 * useKeyboardShortcut(
 *   { key: "Escape", preventDefault: true },
 *   () => setOpen(false),
 *   [setOpen]
 * );
 *
 * // Ctrl+Z for undo
 * useKeyboardShortcut(
 *   { key: "z", ctrl: true, shift: false, preventDefault: true },
 *   () => undo(),
 *   [undo]
 * );
 *
 * // Space bar with code
 * useKeyboardShortcut(
 *   { code: "Space", preventDefault: true, preventRepeat: true },
 *   () => togglePlay(),
 *   [togglePlay]
 * );
 *
 * // Conditional shortcut
 * useKeyboardShortcut(
 *   { key: "Enter", capture: true, enabled: isModalOpen },
 *   () => submitForm(),
 *   [isModalOpen, submitForm]
 * );
 * ```
 */
export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  callback: (e: KeyboardEvent) => void,
  deps: DependencyList = [],
) {
  useEffect(() => {
    // Early exit if disabled
    if (options.enabled === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent repeated events if configured
      if (options.preventRepeat && e.repeat) {
        return;
      }

      // Guard: Don't trigger if typing in an input (unless explicitly disabled)
      if (options.ignoreInputs !== false) {
        if (
          (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
      }

      // Check if key/code matches
      const keyMatches = options.key ? e.key === options.key : true;
      const codeMatches = options.code ? e.code === options.code : true;

      // Check modifier keys (undefined means "don't care")
      const ctrlMatches =
        options.ctrl !== undefined ? e.ctrlKey === options.ctrl : true;
      const metaMatches =
        options.meta !== undefined ? e.metaKey === options.meta : true;
      const shiftMatches =
        options.shift !== undefined ? e.shiftKey === options.shift : true;
      const altMatches =
        options.alt !== undefined ? e.altKey === options.alt : true;

      // All conditions must match
      if (
        keyMatches &&
        codeMatches &&
        ctrlMatches &&
        metaMatches &&
        shiftMatches &&
        altMatches
      ) {
        if (options.preventDefault) e.preventDefault();
        if (options.stopPropagation) e.stopPropagation();
        callback(e);
      }
    };

    window.addEventListener("keydown", handleKeyDown, options.capture);
    return () =>
      window.removeEventListener("keydown", handleKeyDown, options.capture);
  }, [options.enabled, ...deps]);
}
