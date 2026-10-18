import { useEffect } from "react";
import { renderProjectAudio } from "../lib/project-audio";

// Bare page for the render-audio command in packages/cli.
export function AudioRenderPage() {
  useEffect(() => {
    window.__toyMidiCli = { renderProjectAudio };
    return () => {
      delete window.__toyMidiCli;
    };
  }, []);
  return null;
}
