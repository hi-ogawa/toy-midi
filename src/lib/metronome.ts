interface MetronomeContext {
  currentTime: number;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
}

const ACCENT_FREQUENCY = 2093; // C7
const NORMAL_FREQUENCY = 1568; // G6
const ATTACK_SECONDS = 0.001;
const DECAY_SECONDS = 0.03;

export class Metronome {
  readonly output: GainNode;

  private accentOscillator: OscillatorNode;
  private accentEnvelope: GainNode;
  private normalOscillator: OscillatorNode;
  private normalEnvelope: GainNode;

  constructor(private context: MetronomeContext) {
    this.output = this.context.createGain();
    this.output.gain.value = 1;

    const accent = this.createVoice(ACCENT_FREQUENCY);
    this.accentOscillator = accent.oscillator;
    this.accentEnvelope = accent.envelope;

    const normal = this.createVoice(NORMAL_FREQUENCY);
    this.normalOscillator = normal.oscillator;
    this.normalEnvelope = normal.envelope;

    this.accentOscillator.start();
    this.normalOscillator.start();
  }

  click(time: number, accent: boolean): void {
    const startTime = Math.max(this.context.currentTime, time);
    const attackEndTime = startTime + ATTACK_SECONDS;
    const decayEndTime = attackEndTime + DECAY_SECONDS;

    const gain = accent ? this.accentEnvelope.gain : this.normalEnvelope.gain;

    gain.cancelScheduledValues(startTime);
    gain.setValueAtTime(0, startTime);
    gain.linearRampToValueAtTime(1, attackEndTime);
    this.exponentialApproachValueAtTime(gain, 0, attackEndTime, DECAY_SECONDS);
    gain.linearRampToValueAtTime(0, decayEndTime);
  }

  private createVoice(frequency: number): {
    oscillator: OscillatorNode;
    envelope: GainNode;
  } {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    envelope.gain.value = 0;
    oscillator.connect(envelope);
    envelope.connect(this.output);

    return { oscillator, envelope };
  }

  // Match Tone.Envelope's exponentialApproachValueAtTime shape closely enough
  // without keeping Tone.Synth in the metronome audio path.
  private exponentialApproachValueAtTime(
    param: AudioParam,
    value: number,
    time: number,
    rampTime: number,
  ): void {
    const timeConstant = Math.log(rampTime + 1) / Math.log(200);
    param.setTargetAtTime(value, time, timeConstant);
  }
}
