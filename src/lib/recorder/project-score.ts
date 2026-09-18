import { exportMusicXml } from "../musicxml/render";
import { DEFAULT_KEY_SIGNATURE } from "../pitch-spelling";
import { DEFAULT_TAB_OPEN_STRING_PITCHES } from "../tab-annotation";
import { recorderProjectStorage } from "./project-storage";

export async function getRecorderProjectScoreSource({
  projectId,
  trackId,
}: {
  projectId: string;
  trackId: string;
}) {
  const project = await recorderProjectStorage.load(projectId);
  const track = project.midiTracks?.find((track) => track.id === trackId);
  if (!track) {
    throw new Error(`MIDI track ${trackId} not found.`);
  }
  return {
    name: `${project.title} · ${track.name}.musicxml`,
    xml: exportMusicXml({
      notes: track.notes,
      title: project.title,
      tempo: project.tempo,
      timeSignature: project.timeSignature,
      keySignature: track.keySignature ?? DEFAULT_KEY_SIGNATURE,
      openStringPitches:
        track.tabOpenStringPitches ?? DEFAULT_TAB_OPEN_STRING_PITCHES,
      locators: (project.locators ?? []).map(({ id, beat, label }) => ({
        id,
        position: beat,
        label,
      })),
    }),
  };
}
