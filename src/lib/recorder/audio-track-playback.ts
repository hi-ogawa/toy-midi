import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import { DeclickGain } from "../dsp/declick-gain.ts";
import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import { disposeWorklet } from "../dsp/worklet-disposal.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

type ClipPlayback = {
  clipId: string;
  playback: AudioBufferPlayback;
};

/** Owns region playback and a channel that also accepts independently routed input for capture monitoring. */
export class AudioTrackPlayback {
  private readonly transport: AudioContextTransport;
  private playbacks: ClipPlayback[] = [];
  private readonly pitchShiftBus: PitchShiftBus;
  /** Mutes region playback without muting other sources connected to channel.input. */
  private readonly playbackGain: GainNode;
  readonly channel: AudioChannel;

  constructor({
    transport,
    output,
    eq,
    gain,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
    eq: MultibandEqParameters;
    gain: number;
  }) {
    this.transport = transport;
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq,
      gain,
    });
    this.playbackGain = transport.context.createGain();
    this.playbackGain.connect(this.channel.input);
    this.pitchShiftBus = new PitchShiftBus({
      transport,
      output: this.playbackGain,
    });
  }

  setSources(sources: readonly AudioPlaybackSource[]): void {
    for (const { playback } of this.playbacks) {
      playback.dispose();
    }
    this.playbacks = sources.map((source) => {
      const playback = new AudioBufferPlayback({
        transport: this.transport,
        output: this.pitchShiftBus.input,
      });
      playback.setSource(source);
      return { clipId: source.clipId, playback };
    });
  }

  setClipGain({ clipId, gain }: { clipId: string; gain: number }): void {
    for (const entry of this.playbacks) {
      if (entry.clipId === clipId) {
        entry.playback.setGain(gain);
      }
    }
  }

  setPlaybackGain(gain: number): void {
    this.playbackGain.gain.setValueAtTime(
      gain,
      this.transport.context.currentTime,
    );
  }

  dispose(): void {
    this.setSources([]);
    this.pitchShiftBus.dispose();
    this.playbackGain.disconnect();
    this.channel.dispose();
  }
}

/**
 * Delay before disconnecting a closed route. Its output is already silent, so
 * this only needs to outlast the close ramp with room for main-thread timer drift.
 */
const ROUTE_TEARDOWN_MS = 50;

/** Pitch correction for one playback rate, from the bus input to its output. */
type PitchShiftRoute = {
  playbackRate: number;
  pitchShifter?: AudioWorkletNode;
  output: DeclickGain;
};

/**
 * Sums playback sources before pitch correction. The route stays connected
 * across pause and seek, so stopped sources fade out through it and the pitch
 * shifter is reused. Only a playback rate change replaces it.
 */
class PitchShiftBus implements TransportParticipant {
  readonly input: GainNode;
  private readonly transport: AudioContextTransport;
  private readonly output: AudioNode;
  private readonly unregister: () => void;
  private route?: PitchShiftRoute;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.output = output;
    this.input = transport.context.createGain();
    this.unregister = transport.register(this);
  }

  start(): void {
    const playbackRate = this.transport.playbackRate;
    if (this.route?.playbackRate === playbackRate) {
      return;
    }
    const previousRoute = this.route;
    if (previousRoute) {
      // The old pitch shifter still holds audio from before the change, so
      // fade it out at its output rather than cutting it.
      previousRoute.output.close();
      setTimeout(() => this.disconnectRoute(previousRoute), ROUTE_TEARDOWN_MS);
    }
    const context = this.transport.context;
    const output = new DeclickGain(context);
    output.node.connect(this.output);
    let pitchShifter: AudioWorkletNode | undefined;
    if (playbackRate === 1) {
      this.input.connect(output.node);
    } else {
      pitchShifter = createPitchShifterNode({
        context,
        channelCount: 2,
        pitchRatio: 1 / playbackRate,
      });
      this.input.connect(pitchShifter).connect(output.node);
    }
    // Open with the run's sources, so the new route never carries the tail of
    // sources stopped just before it.
    output.open(this.transport.playbackAnchor!.contextTime);
    this.route = { playbackRate, pitchShifter, output };
  }

  stop(): void {}

  dispose(): void {
    this.unregister();
    if (this.route) {
      this.disconnectRoute(this.route);
      this.route = undefined;
    }
  }

  private disconnectRoute(route: PitchShiftRoute): void {
    this.input.disconnect(route.pitchShifter ?? route.output.node);
    if (route.pitchShifter) {
      disposeWorklet(route.pitchShifter);
    }
    route.output.node.disconnect();
  }
}
