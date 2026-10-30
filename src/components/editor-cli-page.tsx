import { useEffect, useState } from "react";
import { EditorRuntime } from "../lib/runtime";

// Bare editor runtime for commands in packages/cli.
export function EditorCliPage() {
  const [runtime] = useState(() => new EditorRuntime());
  useEffect(() => {
    window.toyMidi.runtime = runtime;
    return () => {
      delete window.toyMidi.runtime;
    };
  }, [runtime]);
  return null;
}
