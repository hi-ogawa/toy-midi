// Write a project's MIDI tracks to a MIDI file, as the editor menu's Export
// MIDI does, without opening the app.
//
// Usage:
//   tsx tools/export-midi.ts song.json song.mid
//   tsx tools/export-midi.ts song.toymidi.zip song.mid
//   tsx tools/export-midi.ts 'https://toy-midi.hiro18181.workers.dev/draft#p=...' song.mid

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import JSZip from "jszip";
import { exportMidi } from "../src/lib/midi-export.ts";
import {
  deserializeMidiTrackState,
  type SerializedEditorRuntimeState,
} from "../src/lib/persistence.ts";
import { readProjectArchive } from "../src/lib/project-archive.ts";
import {
  convertSharedProject,
  decodeSharedProject,
  fetchSharedProject,
  getSharePayload,
  getShareSource,
} from "../src/lib/project-share.ts";
import { syncTrackOrder } from "../src/lib/track-order.ts";

const USAGE = `\
usage: tsx tools/export-midi.ts <input> <output.mid>

<input> is a .toymidi.zip archive, a SharedProject .json file, or a share
link: /draft#p=<payload>, or /draft?src=<url> for the project at its src URL.`;

// Every ZIP archive starts with a local file header.
const ZIP_SIGNATURE = Buffer.from("PK\x03\x04", "latin1");

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
  if (/^https?:\/\//.test(input)) {
    const payload = getSharePayload(input);
    if (payload) {
      return decodeSharedProject(payload);
    }
    const src = getShareSource(input);
    if (src) {
      // Resolve src as the app does, against the draft link's origin.
      return fetchSharedProject(new URL(src, input).href);
    }
    throw new Error(`${input} is not a share link.`);
  }
  const bytes = await readFile(input);
  if (bytes.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    return readProjectArchive(await JSZip.loadAsync(bytes));
  }
  try {
    return convertSharedProject(JSON.parse(bytes.toString()));
  } catch {
    throw new Error(`${input} does not hold a readable project.`);
  }
}

// The runtime completes an older or partial track order on load, so complete
// it the same way before reading the MIDI tracks off it.
function exportProjectMidi(project: SerializedEditorRuntimeState): Uint8Array {
  const midiTracks = (project.midiTracks ?? []).map(deserializeMidiTrackState);
  const trackOrder = syncTrackOrder({
    trackOrder: project.trackOrder ?? [],
    audioTracks: [],
    midiTracks,
  });
  return exportMidi({
    title: project.title,
    tempo: project.tempo,
    timeSignature: project.timeSignature,
    locators: project.locators ?? [],
    tracks: midiTracks.toSorted(
      (a, b) => trackOrder.indexOf(a.id) - trackOrder.indexOf(b.id),
    ),
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
