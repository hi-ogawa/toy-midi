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

/** A gain stage that opens and closes with a short ramp instead of a step. */
export class DeclickGain {
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

  /** Opens at full level at audio-clock `time`, without a ramp. */
  openImmediately(time: number): void {
    this.node.gain.setValueAtTime(1, time);
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
