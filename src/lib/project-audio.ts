import JSZip from "jszip";
import { MIX_SAMPLE_RATE, renderMix, resolveMix } from "./mix.ts";
import { deserializeEditorRuntimeState } from "./persistence.ts";
import { readProjectArchive } from "./project-archive.ts";
import { resolveTrackRegions } from "./runtime.ts";
import { encodeWav } from "./wav.ts";

/** Render a project archive's mix to a WAV, matching Export Audio in the editor. */
export async function renderProjectAudio(archive: Blob): Promise<Blob> {
  const project = deserializeEditorRuntimeState({
    context: new OfflineAudioContext(1, 1, MIX_SAMPLE_RATE),
    project: await readProjectArchive(await JSZip.loadAsync(archive)),
  });
  const buffer = await renderMix({
    mix: resolveMix({
      ...project,
      audioTracks: project.audioTracks.map((track) =>
        resolveTrackRegions(track),
      ),
    }),
    sampleRate: MIX_SAMPLE_RATE,
  });
  return encodeWav(buffer);
}
