import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import { ensureBiquadEqWorklet } from "../dsp/biquad-eq-node.ts";
import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import { getClipSources } from "./audio-sources.ts";
import type { RecorderRuntimeState } from "./runtime.ts";

interface RecorderMix {
  tracks: {
    eq: MultibandEqParameters;
    gain: number;
    regions: AudioPlaybackSource[];
  }[];
  masterGain: number;
  duration: number;
}

/** Snapshot committed audio at 1x, independent of transport and reference audio. */
export function resolveRecorderMix(state: RecorderRuntimeState): RecorderMix {
  const gains = deriveTrackMix(state);
  const tracks: RecorderMix["tracks"] = [
    ...state.audioTracks,
    state.recordingTrack,
  ].map((track) => ({
    eq: track.eq,
    gain: gains.get(track.id)!,
    regions: getClipSources(track.regions),
  }));
  // Mixer toggles change sound, not the committed arrangement's extent.
  let duration = 0;
  for (const track of tracks) {
    for (const region of track.regions) {
      // Crop pre-zero audio without shifting the region's timeline end.
      region.timelineStart = Math.max(0, region.timelineStart);
      duration = Math.max(duration, region.timelineEnd);
    }
  }
  return { tracks, masterGain: state.masterGain, duration };
}

/** Render floats without normalization or clipping; PCM encoding owns clipping. */
export async function renderRecorderMix({
  mix,
  sampleRate,
}: {
  mix: RecorderMix;
  sampleRate: number;
}): Promise<AudioBuffer> {
  if (mix.duration <= 0) {
    throw new Error("No audio to export.");
  }
  const context = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(mix.duration * sampleRate),
    sampleRate,
  });
  const master = context.createGain();
  master.gain.value = mix.masterGain;
  master.channelCount = 2;
  master.channelCountMode = "explicit";
  master.channelInterpretation = "speakers";
  master.connect(context.destination);
  await ensureBiquadEqWorklet(context);
  for (const track of mix.tracks) {
    const channel = new AudioChannel({
      context,
      output: master,
      eq: track.eq,
      gain: track.gain,
    });
    for (const region of track.regions) {
      const source = context.createBufferSource();
      source.buffer = region.buffer;
      source.connect(channel.input);
      source.start(
        region.timelineStart,
        region.timelineStart - region.timelineOffset,
        region.timelineEnd - region.timelineStart,
      );
    }
  }
  return context.startRendering();
}

/** Effective channel gain per track id after mute and solo. */
export function deriveTrackMix({
  audioTracks,
  recordingTrack,
}: Pick<RecorderRuntimeState, "audioTracks" | "recordingTrack">): Map<
  string,
  number
> {
  const tracks = [...audioTracks, recordingTrack];
  const anyTrackSoloed = tracks.some((track) => track.soloed);
  return new Map(
    tracks.map((track) => [
      track.id,
      track.muted || (anyTrackSoloed && !track.soloed) ? 0 : track.gain,
    ]),
  );
}
