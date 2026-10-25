import { useEffect, useState } from "react";
import { EditorRuntime } from "../lib/runtime";
import { toyMidiUtils } from "../lib/toy-midi-utils";

// Bare editor runtime for commands in packages/cli.
export function EditorCliPage() {
  const [runtime] = useState(() => new EditorRuntime());
  useEffect(() => {
    window.toyMidi = { runtime, utils: toyMidiUtils };
    return () => {
      delete window.toyMidi;
    };
  }, [runtime]);
  return null;
}
