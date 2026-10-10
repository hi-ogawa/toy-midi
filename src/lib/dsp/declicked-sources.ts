/**
 * Ramp length for opening or closing a signal mid-waveform. Long enough to
 * remove the waveform step, short enough not to sound like a fade.
 */
const DECLICK_SECONDS = 0.005;

/**
 * Delay before a close starts. The main thread's `currentTime` can trail the
 * audio thread, and a ramp scheduled in the past jumps to its midpoint or end.
 */
const CLOSE_LEAD_SECONDS = 0.01;

/** One buffer source and its envelope, from start until the source ends. */
type Voice = {
  source: AudioBufferSourceNode;
  envelope: DeclickGain;
  stopped: boolean;
};

/**
 * Plays buffer slices into one output, fading each in and out instead of
 * starting or cutting it mid-waveform.
 */
export class DeclickedSources {
  private readonly context: BaseAudioContext;
  private readonly output: AudioNode;
  /** Sources still sounding, including stopped ones that are fading out. */
  private readonly voices = new Set<Voice>();
  private onSilent?: () => void;

  constructor({
    context,
    output,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
  }) {
    this.context = context;
    this.output = output;
  }

  /** Plays `duration` buffer seconds from `offset`, starting at audio-clock `time`. */
  start({
    buffer,
    playbackRate,
    time,
    offset,
    duration,
  }: {
    buffer: AudioBuffer;
    playbackRate: number;
    time: number;
    offset: number;
    duration: number;
  }): void {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const envelope = new DeclickGain(this.context);
    envelope.open(time);
    source.connect(envelope.node).connect(this.output);
    const voice: Voice = { source, envelope, stopped: false };
    // Disconnect after the fade has rendered, not when stop() is called.
    source.onended = () => {
      source.disconnect();
      envelope.node.disconnect();
      this.voices.delete(voice);
      if (this.voices.size === 0) {
        const onSilent = this.onSilent;
        this.onSilent = undefined;
        onSilent?.();
      }
    };
    source.start(time, offset, duration);
    this.voices.add(voice);
  }

  /** Fades out every source still playing and stops each once silent. */
  stop(): void {
    for (const voice of this.voices) {
      if (!voice.stopped) {
        voice.stopped = true;
        voice.source.stop(voice.envelope.close());
      }
    }
  }

  /** Runs `callback` once every source has ended, right away if none are sounding. */
  whenSilent(callback: () => void): void {
    if (this.voices.size === 0) {
      callback();
      return;
    }
    this.onSilent = callback;
  }
}

/** A gain stage that opens and closes with a short ramp instead of a step. */
class DeclickGain {
  readonly node: GainNode;

  /** Starts closed. */
  constructor(context: BaseAudioContext) {
    this.node = context.createGain();
    this.node.gain.value = 0;
  }

  /** Ramps open from silence, starting at audio-clock `time`. */
  open(time: number): void {
    const gain = this.node.gain;
    gain.setValueAtTime(0, time);
    gain.linearRampToValueAtTime(1, time + DECLICK_SECONDS);
  }

  /** Ramps closed from the current level and returns when it reaches silence. */
  close(): number {
    const gain = this.node.gain;
    const time = this.node.context.currentTime + CLOSE_LEAD_SECONDS;
    // Hold the level reached so far, so closing during the opening ramp or
    // before it begins starts from that level instead of jumping.
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(0, time + DECLICK_SECONDS);
    return time + DECLICK_SECONDS;
  }
}
