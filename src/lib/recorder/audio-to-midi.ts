import type { Note } from "../../types.ts";
import { bassPitchClient } from "../bass-pitch/client.ts";
import { makeGridTranscribeParams } from "../bass-pitch/transcription.ts";
import { secondsToBeats } from "../timeline.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";

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
  const audible = sources.filter(
    (source) => source.timelineEnd > Math.max(0, source.timelineStart),
  );
  if (audible.length === 0) {
    throw new Error("The source track has no audio to transcribe.");
  }
  const offset = Math.max(
    0,
    Math.min(...audible.map((source) => source.timelineStart)),
  );
  const end = Math.max(...audible.map((source) => source.timelineEnd));
  const sampleRate = audible[0]!.buffer.sampleRate;
  const context = new OfflineAudioContext(
    1,
    Math.ceil((end - offset) * sampleRate),
    sampleRate,
  );
  for (const region of audible) {
    const start = Math.max(0, region.timelineStart);
    const source = context.createBufferSource();
    source.buffer = region.buffer;
    source.connect(context.destination);
    source.start(
      start - offset,
      start - region.timelineOffset,
      region.timelineEnd - start,
    );
  }
  const buffer = await context.startRendering();
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
