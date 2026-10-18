import JSZip from "jszip";
import { useEffect, useState } from "react";
import { exportProjectMidi } from "../lib/midi-export";
import { readProjectArchive } from "../lib/project-archive";
import { convertSharedProject } from "../lib/project-share";
import { EditorRuntime } from "../lib/runtime";
import { encodeWav } from "../lib/wav";

// Pieces for CLI commands to compose with the runtime, kept off its API.
const editorUtils = {
  readProjectArchive: async (archive: Blob) =>
    readProjectArchive(await JSZip.loadAsync(archive)),
  convertSharedProject,
  encodeWav,
  exportProjectMidi,
};

export type EditorUtils = typeof editorUtils;

// Bare editor runtime for commands in packages/cli.
export function EditorCliPage() {
  const [runtime] = useState(() => new EditorRuntime());
  useEffect(() => {
    window.__toyMidiCli = { editor: runtime, editorUtils };
    return () => {
      delete window.__toyMidiCli;
    };
  }, [runtime]);
  return null;
}
