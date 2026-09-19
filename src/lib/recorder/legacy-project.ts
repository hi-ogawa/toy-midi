import { createDefaultMultibandEq } from "../dsp/biquad-eq-node";
import { type AnySavedProject, fromSavedProject } from "../project-store";
import {
  serializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
} from "./persistence";
import { clampTrackHeight, createDefaultRecorderRuntimeState } from "./runtime";

/** Convert a legacy MIDI project into recorder project content. */
export async function convertLegacyProject({
  name,
  project,
  loadAudio,
}: {
  name: string;
  project: AnySavedProject;
  loadAudio: (assetKey: string) => Promise<Blob | undefined>;
}): Promise<SerializedRecorderRuntimeState> {
  if (project.version !== 1 && project.version !== 2) {
    throw new Error("Unsupported legacy project version");
  }
  const legacy = fromSavedProject(project);
  const content = serializeRecorderRuntimeState(
    createDefaultRecorderRuntimeState(),
  );
  content.title = name;
  content.tempo = legacy.tempo;
  content.timeSignature = legacy.timeSignature;
  content.masterGain = legacy.masterVolume;
  content.metronomeGain = legacy.metronomeVolume;
  content.locators = legacy.locators.map(({ id, position, label }) => ({
    id,
    beat: position,
    label,
  }));
  content.midiTracks = [
    {
      id: crypto.randomUUID(),
      name: "MIDI 1",
      notes: structuredClone(legacy.notes),
      program: legacy.midiProgram,
      gain: legacy.midiVolume,
      muted: legacy.midiMuted,
      soloed: legacy.midiSoloed,
      height: 300,
      eq: createDefaultMultibandEq(),
      tabAnnotationEnabled: legacy.tabAnnotationEnabled,
      tabOpenStringPitches: [...legacy.tabOpenStringPitches],
      keySignature: { ...legacy.keySignature },
    },
  ];

  // Decode every referenced asset before the caller saves the recorder copy.
  // Offline decoding requires no playback session or audio device.
  const context = legacy.audioTracks.length
    ? new OfflineAudioContext(1, 1, 48000)
    : undefined;
  for (const track of legacy.audioTracks) {
    try {
      const blob = await loadAudio(track.assetKey);
      if (!blob) {
        throw new Error("Audio asset is missing");
      }
      const buffer = await context!.decodeAudioData(await blob.arrayBuffer());
      content.audioTracks.push({
        id: track.id,
        height: clampTrackHeight(track.waveformHeight),
        gain: track.volume,
        muted: track.muted,
        soloed: track.soloed,
        timelineOffset: track.offset,
        trimStart: 0,
        trimEnd: buffer.duration,
        clip: {
          name: track.fileName,
          pcm: {
            sampleRate: buffer.sampleRate,
            channels: Array.from(
              { length: buffer.numberOfChannels },
              (_, channel) => buffer.getChannelData(channel).slice(),
            ),
          },
        },
      });
    } catch (cause) {
      throw new Error(`Could not convert audio track "${track.fileName}"`, {
        cause,
      });
    }
  }
  // Viewport, grid, linked offsets, and metronome enabled state are legacy
  // editor preferences. Conversion also leaves global auto-scroll untouched.
  return content;
}
