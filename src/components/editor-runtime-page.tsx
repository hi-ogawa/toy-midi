import { useEffect, useState } from "react";
import { EditorRuntime } from "../lib/runtime";

// Bare editor runtime for commands in packages/cli.
export function EditorRuntimePage() {
  const [runtime] = useState(() => new EditorRuntime());
  useEffect(() => {
    window.__toyMidiCli = { editor: runtime };
    return () => {
      delete window.__toyMidiCli;
    };
  }, [runtime]);
  return null;
}
