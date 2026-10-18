// Write a project's MIDI tracks to a MIDI file, as the editor menu's Export
// MIDI does, without opening the app.
//
// Usage:
//   tsx tools/export-midi.ts song.json song.mid
//   tsx tools/export-midi.ts song.toymidi.zip song.mid

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import JSZip from "jszip";
import { exportMidi } from "../src/lib/midi-export.ts";
import {
  deserializeEditorRuntimeState,
  type SerializedEditorRuntimeState,
} from "../src/lib/persistence.ts";
import { readProjectArchive } from "../src/lib/project-archive.ts";
import { convertSharedProject } from "../src/lib/project-share.ts";

const USAGE = `\
usage: tsx tools/export-midi.ts <input> <output.mid>

<input> is a .toymidi.zip archive or a SharedProject .json file.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    throw new Error(USAGE);
  }

  const project = await readProject(input);
  await writeFile(output, exportProjectMidi(project));
  console.log(`wrote ${output}`);
}

async function readProject(
  input: string,
): Promise<SerializedEditorRuntimeState> {
  if (input.endsWith(".toymidi.zip")) {
    return readProjectArchive(await JSZip.loadAsync(await readFile(input)));
  }
  if (input.endsWith(".json")) {
    return convertSharedProject(JSON.parse(await readFile(input, "utf8")));
  }
  throw new Error(USAGE);
}

function exportProjectMidi(project: SerializedEditorRuntimeState): Uint8Array {
  // Only audio clips need an AudioContext, to decode their samples, and audio
  // tracks never reach a MIDI file.
  const state = deserializeEditorRuntimeState({
    context: undefined as never,
    project: { ...project, audioTracks: [] },
  });
  return exportMidi({ ...state, tracks: state.midiTracks });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
