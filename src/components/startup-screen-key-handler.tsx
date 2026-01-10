import { useEffect } from "react";

type StartupScreenKeyHandlerProps = {
  onEnter: () => void;
};

/**
 * Handles Enter key press on startup screen to quickly start/continue project.
 * Separated into its own component to simplify dependencies and cleanup.
 */
export function StartupScreenKeyHandler({
  onEnter,
}: StartupScreenKeyHandlerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onEnter();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onEnter]);

  return null;
}
