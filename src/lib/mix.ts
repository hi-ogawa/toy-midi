import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import { getClipSources } from "./audio-sources.ts";
import type { MultibandEqParameters } from "./dsp/biquad-eq-multiband.ts";
import { ensureBiquadEqWorklet } from "./dsp/biquad-eq-worklet-node.ts";
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
    eq: MultibandEqParameters;
    gain: number;
    pan: number;
    regions: AudioPlaybackSource[];
  }[];
  midiTracks: {
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
    eq: track.eq,
    gain: gains.get(track.id)!,
    pan: track.pan,
    regions: getClipSources(track.regions),
  }));
  const midiTracks: Mix["midiTracks"] = state.midiTracks.map((track) => ({
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

/** Render floats without normalization or clipping; PCM encoding owns clipping. */
export async function renderMix({
  mix,
  sampleRate,
}: {
  mix: Mix;
  sampleRate: number;
}): Promise<AudioBuffer> {
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
      const master = context.createGain();
      master.gain.value = mix.masterGain;
      master.channelCount = 2;
      master.channelCountMode = "explicit";
      master.channelInterpretation = "speakers";
      master.connect(context.destination);
      using cleanup = new DisposableStack();
      await ensureBiquadEqWorklet(context);
      for (const track of mix.tracks) {
        const channel = new AudioChannel({
          context,
          output: master,
          eq: track.eq,
          gain: track.gain,
          pan: track.pan,
        });
        cleanup.defer(() => channel.dispose());
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
          await synth.init(track.preset, { waitForSoundfonts: true });
          const channel = new AudioChannel({
            context,
            output: master,
            eq: track.eq,
            gain: track.gain,
            pan: track.pan,
          });
          cleanup.defer(() => channel.dispose());
          synth.output.connect(channel.input);
          synth.setNotes(track.notes);
          synth.start({ contextTime: 0, position: 0, playbackRate: 1 });
        }),
      );
      // Await so cleanup runs after rendering, not before.
      return await context.startRendering();
    },
  );
}

/**
 * Renders in a temporary iframe and returns the result copied into this page.
 * Chromium never collects an OfflineAudioContext that has loaded an AudioWorklet
 * module, so its render target would stay in memory for the life of the page.
 * Removing the iframe tears the context down with it.
 */
async function renderOfflineInFrame(
  options: OfflineAudioContextOptions,
  render: (context: OfflineAudioContext) => Promise<AudioBuffer>,
): Promise<AudioBuffer> {
  using cleanup = new DisposableStack();
  const frame = document.createElement("iframe");
  cleanup.defer(() => frame.remove());
  frame.hidden = true;
  document.body.append(frame);
  const frameWindow = frame.contentWindow as Window & typeof globalThis;
  const context = new frameWindow.OfflineAudioContext(options);
  const rendered = await render(context);
  const buffer = new AudioBuffer({
    numberOfChannels: rendered.numberOfChannels,
    length: rendered.length,
    sampleRate: rendered.sampleRate,
  });
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    buffer.copyToChannel(rendered.getChannelData(channel), channel);
  }
  return buffer;
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
