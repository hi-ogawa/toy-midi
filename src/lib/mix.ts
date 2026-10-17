import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import { getClipSources } from "./audio-sources.ts";
import type { MultibandEqParameters } from "./dsp/biquad-eq-multiband.ts";
import { ensureBiquadEqWorklet } from "./dsp/biquad-eq-worklet-node.ts";
import {
  ensureLoudnessMeterWorklet,
  LoudnessMeterWorkletNode,
} from "./dsp/loudness-meter-worklet-node.ts";
import type { LoudnessMeasurement } from "./dsp/loudness.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import {
  convertToTimelineNotes,
  MidiSynthWorkletNode,
} from "./midi-synth-worklet-node.ts";
import type { EditorRuntimeState, MidiPreset } from "./runtime.ts";

// Release length depends on the preset, so this only needs to cover typical
// ones.
const MIDI_RELEASE_SECONDS = 2;

interface Mix {
  tracks: {
    id: string;
    eq: MultibandEqParameters;
    gain: number;
    pan: number;
    regions: AudioPlaybackSource[];
  }[];
  midiTracks: {
    id: string;
    eq: MultibandEqParameters;
    gain: number;
    pan: number;
    preset: MidiPreset;
    notes: TimelineNote[];
  }[];
  masterGain: number;
  duration: number;
}

/** Snapshot committed audio and MIDI at 1x, independent of transport and reference audio. */
export function resolveMix(state: EditorRuntimeState): Mix {
  const gains = deriveTrackMix(state);
  const tracks: Mix["tracks"] = state.audioTracks.map((track) => ({
    id: track.id,
    eq: track.eq,
    gain: gains.get(track.id)!,
    pan: track.pan,
    regions: getClipSources(track.regions),
  }));
  const midiTracks: Mix["midiTracks"] = state.midiTracks.map((track) => ({
    id: track.id,
    eq: track.eq,
    gain: gains.get(track.id)!,
    pan: track.pan,
    preset: track,
    notes: convertToTimelineNotes(track.notes, state.tempo),
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
  for (const track of midiTracks) {
    for (const note of track.notes) {
      duration = Math.max(duration, note.end + MIDI_RELEASE_SECONDS);
    }
  }
  return { tracks, midiTracks, masterGain: state.masterGain, duration };
}

export interface RenderedMix {
  buffer: AudioBuffer;
  loudness: MixLoudness;
}

export interface MixLoudness {
  mix: LoudnessMeasurement;
  /** Each track's share of the rendered file, after its EQ, gain, pan, and the master gain */
  tracks: Map<string, LoudnessMeasurement>;
}

/**
 * Render floats without normalization or clipping; PCM encoding owns clipping.
 * Meters on the master and on every track measure loudness during the same render.
 */
export async function renderMix({
  mix,
  sampleRate,
}: {
  mix: Mix;
  sampleRate: number;
}): Promise<RenderedMix> {
  if (mix.duration <= 0) {
    throw new Error("No audio to export.");
  }
  return renderOfflineInFrame(
    {
      numberOfChannels: 2,
      length: Math.ceil(mix.duration * sampleRate),
      sampleRate,
    },
    async (context) => {
      using cleanup = new DisposableStack();
      await Promise.all([
        ensureBiquadEqWorklet(context),
        ensureLoudnessMeterWorklet(context),
      ]);
      const createMeter = () => {
        const meter = new LoudnessMeterWorkletNode(context);
        cleanup.defer(() => meter.dispose());
        return meter;
      };
      const master = context.createGain();
      master.gain.value = mix.masterGain;
      master.channelCount = 2;
      master.channelCountMode = "explicit";
      master.channelInterpretation = "speakers";
      master.connect(context.destination);
      const masterMeter = createMeter();
      master.connect(masterMeter);
      const trackMeters = new Map<string, LoudnessMeterWorkletNode>();
      const createChannel = (track: Mix["tracks" | "midiTracks"][number]) => {
        const channel = new AudioChannel({
          context,
          output: master,
          eq: track.eq,
          gain: track.gain,
          pan: track.pan,
        });
        cleanup.defer(() => channel.dispose());
        const meter = createMeter();
        channel.connectTap(meter);
        trackMeters.set(track.id, meter);
        return channel;
      };
      for (const track of mix.tracks) {
        const channel = createChannel(track);
        for (const region of track.regions) {
          const source = context.createBufferSource();
          source.buffer = region.buffer;
          const gain = context.createGain();
          gain.gain.value = region.gain;
          source.connect(gain).connect(channel.input);
          source.start(
            region.timelineStart,
            region.timelineStart - region.timelineOffset,
            region.timelineEnd - region.timelineStart,
          );
        }
      }
      await Promise.all(
        mix.midiTracks.map(async (track) => {
          const synth = new MidiSynthWorkletNode(context);
          cleanup.defer(() => synth.dispose());
          await synth.init();
          await synth.setPreset(track.preset);
          const channel = createChannel(track);
          synth.output.connect(channel.input);
          await synth.setNotes(track.notes);
          await synth.start({ contextTime: 0, position: 0, playbackRate: 1 });
        }),
      );
      // Await so cleanup runs after rendering and measuring, not before.
      const buffer = await context.startRendering();
      // Track taps sit before the master gain, which offsets them exactly.
      const masterGainDb = 20 * Math.log10(mix.masterGain);
      const tracks = new Map(
        await Promise.all(
          [...trackMeters].map(async ([id, meter]) => {
            const measurement = await meter.measure();
            return [
              id,
              {
                ...measurement,
                integrated: measurement.integrated + masterGainDb,
                truePeak: measurement.truePeak + masterGainDb,
              },
            ] as const;
          }),
        ),
      );
      return {
        buffer,
        loudness: { mix: await masterMeter.measure(), tracks },
      };
    },
  );
}

/**
 * Renders in a temporary iframe and returns the result with its buffer copied
 * into this page. Chromium never collects an OfflineAudioContext that has
 * loaded an AudioWorklet module, so its render target would stay in memory for
 * the life of the page. Removing the iframe tears the context down with it.
 */
async function renderOfflineInFrame<T extends { buffer: AudioBuffer }>(
  options: OfflineAudioContextOptions,
  render: (context: OfflineAudioContext) => Promise<T>,
): Promise<T> {
  using cleanup = new DisposableStack();
  const frame = document.createElement("iframe");
  cleanup.defer(() => frame.remove());
  frame.hidden = true;
  document.body.append(frame);
  const frameWindow = frame.contentWindow as Window & typeof globalThis;
  const context = new frameWindow.OfflineAudioContext(options);
  const result = await render(context);
  const rendered = result.buffer;
  const buffer = new AudioBuffer({
    numberOfChannels: rendered.numberOfChannels,
    length: rendered.length,
    sampleRate: rendered.sampleRate,
  });
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    buffer.copyToChannel(rendered.getChannelData(channel), channel);
  }
  return { ...result, buffer };
}

/** Render raw sources to mono, ignoring clip playback gain, cropping pre-zero audio and returning the timeline offset in seconds. */
export async function renderAudioSources(
  sources: readonly AudioPlaybackSource[],
): Promise<{ buffer: AudioBuffer; offset: number }> {
  let offset = Infinity;
  let end = 0;
  for (const region of sources) {
    offset = Math.min(offset, Math.max(0, region.timelineStart));
    end = Math.max(end, region.timelineEnd);
  }
  if (end <= offset) {
    throw new Error("No audio to render.");
  }
  const sampleRate = sources[0]!.buffer.sampleRate;
  const context = new OfflineAudioContext(
    1,
    Math.ceil((end - offset) * sampleRate),
    sampleRate,
  );
  for (const region of sources) {
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
  return { buffer, offset };
}

/** Effective channel gain per track id after mute and solo. */
export function deriveTrackMix({
  audioTracks,
  midiTracks,
}: Pick<EditorRuntimeState, "audioTracks" | "midiTracks">): Map<
  string,
  number
> {
  const tracks = [...audioTracks, ...midiTracks];
  const audibleTracks = new Set(getAudibleItems(tracks));
  return new Map(
    tracks.map((track) => [
      track.id,
      audibleTracks.has(track) ? track.gain : 0,
    ]),
  );
}

/** Muted items stay silent; any soloed item suppresses all non-soloed items in the group. */
export function getAudibleItems<T extends { muted: boolean; soloed: boolean }>(
  items: readonly T[],
): T[] {
  const anySoloed = items.some((item) => item.soloed);
  return items.filter((item) => !item.muted && (!anySoloed || item.soloed));
}
