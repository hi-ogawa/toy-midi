import type { RecorderRuntimeState } from "./runtime.ts";

interface MixRegion {
  buffer: AudioBuffer;
  start: number;
  offset: number;
  duration: number;
}

interface RecorderMix {
  tracks: { gain: number; regions: MixRegion[] }[];
  masterGain: number;
  duration: number;
}

/** Snapshot committed audio at 1x, independent of transport and reference audio. */
export function resolveRecorderMix(
  state: Pick<
    RecorderRuntimeState,
    "audioTracks" | "recordingTrack" | "takeRegions" | "masterGain"
  >,
): RecorderMix {
  const { audioTrackGains, recordingGain } = deriveTrackMix(state);
  const tracks: RecorderMix["tracks"] = state.audioTracks.map(
    (track, index) => ({
      gain: audioTrackGains[index]!,
      regions: track.clip
        ? [
            cropRegion({
              buffer: track.clip.buffer,
              timelineOffset: track.timelineOffset,
              start: track.timelineOffset + track.trimStart,
              end: track.timelineOffset + track.trimEnd,
            }),
          ]
        : [],
    }),
  );
  tracks.push({
    gain: recordingGain,
    regions: state.takeRegions.flatMap((region) =>
      region.take.buffer
        ? [
            cropRegion({
              buffer: region.take.buffer,
              timelineOffset: region.take.timelineOffset,
              start: region.timelineStart,
              end: region.timelineEnd,
            }),
          ]
        : [],
    ),
  });
  // Mixer toggles change sound, not the committed arrangement's extent.
  let duration = 0;
  for (const track of tracks) {
    for (const region of track.regions) {
      duration = Math.max(duration, region.start + region.duration);
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
  for (const track of mix.tracks) {
    const gain = context.createGain();
    gain.gain.value = track.gain;
    gain.connect(master);
    for (const region of track.regions) {
      const source = context.createBufferSource();
      source.buffer = region.buffer;
      source.connect(gain);
      source.start(region.start, region.offset, region.duration);
    }
  }
  return context.startRendering();
}

export function deriveTrackMix({
  audioTracks,
  recordingTrack,
}: Pick<RecorderRuntimeState, "audioTracks" | "recordingTrack">) {
  const tracks = [...audioTracks, recordingTrack];
  const anyTrackSoloed = tracks.some((track) => track.soloed);
  const gains = tracks.map((track) =>
    track.muted || (anyTrackSoloed && !track.soloed) ? 0 : track.gain,
  );
  return { audioTrackGains: gains.slice(0, -1), recordingGain: gains.at(-1)! };
}

function cropRegion({
  buffer,
  timelineOffset,
  start,
  end,
}: {
  buffer: AudioBuffer;
  timelineOffset: number;
  start: number;
  end: number;
}): MixRegion {
  start = Math.max(0, start);
  return {
    buffer,
    start,
    offset: start - timelineOffset,
    duration: end - start,
  };
}
