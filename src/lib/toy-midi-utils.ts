import JSZip from "jszip";
import { readProjectArchive } from "./project-archive";
import { convertSharedProject } from "./project-share";
import { encodeWav } from "./wav";

/**
 * Helpers to compose with the runtime, kept off its API, which pages that set
 * `window.toyMidi` put beside it.
 */
export const toyMidiUtils = {
  convertSharedProject,
  readProjectArchive: async (archive: Blob) =>
    readProjectArchive(await JSZip.loadAsync(archive)),
  encodeWav,
};

export type ToyMidiUtils = typeof toyMidiUtils;
