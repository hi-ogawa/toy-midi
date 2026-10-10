/**
 * Ramp length for opening or closing a signal mid-waveform. Long enough to
 * remove the waveform step, short enough not to sound like a fade.
 */
const DECLICK_SECONDS = 0.005;

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

  /**
   * Ramps closed from the current level, starting at audio-clock `time`, and
   * returns when it reaches silence.
   */
  close(time: number): number {
    const gain = this.node.gain;
    // Hold the level reached so far, so closing during the opening ramp or
    // before it begins starts from that level instead of jumping. The level is
    // read now, which only differs from the level at `time` mid-ramp.
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(0, time + DECLICK_SECONDS);
    return time + DECLICK_SECONDS;
  }
}
