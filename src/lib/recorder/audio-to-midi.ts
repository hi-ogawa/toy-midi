import type { Note } from "../../types.ts";
import { bassPitchClient } from "../bass-pitch/client.ts";
import { makeGridTranscribeParams } from "../bass-pitch/transcription.ts";
import { secondsToBeats } from "../timeline.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import { renderAudioSources } from "./mix.ts";

/** Transcribe the committed arrangement before channel gain/EQ, keeping project timing. */
export async function transcribeRecorderAudio({
  sources,
  tempo,
  cellsPerBeat,
  activityDb,
  splitThreshold,
  onProgress,
}: {
  sources: AudioPlaybackSource[];
  tempo: number;
  cellsPerBeat: number;
  activityDb: number;
  splitThreshold: number;
  onProgress: (fraction: number) => void;
}): Promise<Note[]> {
  const { buffer, offset } = await renderAudioSources(sources);
  const notes = await bassPitchClient.transcribe(
    buffer,
    makeGridTranscribeParams({
      offset,
      bpm: tempo,
      cellsPerBeat,
      activityDb,
      splitThreshold,
    }),
    onProgress,
  );
  return notes.map((note) => ({
    id: crypto.randomUUID(),
    pitch: note.pitch,
    start: secondsToBeats(note.project_start, tempo),
    duration: secondsToBeats(note.project_end - note.project_start, tempo),
    velocity: 100,
  }));
}
