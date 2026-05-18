import * as Tone from "tone";

type ToneContext = ReturnType<typeof Tone.getContext>;

const ACCENT_FREQUENCY = 2093; // C7
const NORMAL_FREQUENCY = 1568; // G6
const ATTACK_SECONDS = 0.001;
const DECAY_SECONDS = 0.03;

function createVoice(
  context: ToneContext,
  frequency: number,
  output: AudioNode,
): {
  oscillator: OscillatorNode;
  envelope: GainNode;
} {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  envelope.gain.value = 0;
  oscillator.connect(envelope);
  envelope.connect(output);

  return { oscillator, envelope };
}

export class Metronome {
  readonly output: GainNode;

  private accentOscillator: OscillatorNode;
  private accentEnvelope: GainNode;
  private normalOscillator: OscillatorNode;
  private normalEnvelope: GainNode;

  constructor(private context: ToneContext) {
    this.output = this.context.createGain();
    this.output.gain.value = 1;

    const accent = createVoice(this.context, ACCENT_FREQUENCY, this.output);
    this.accentOscillator = accent.oscillator;
    this.accentEnvelope = accent.envelope;

    const normal = createVoice(this.context, NORMAL_FREQUENCY, this.output);
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
    // Match Tone.Envelope's exponentialApproachValueAtTime shape closely enough
    // without keeping Tone.Synth in the metronome audio path.
    const decayTimeConstant = Math.log(DECAY_SECONDS + 1) / Math.log(200);
    gain.setTargetAtTime(0, attackEndTime, decayTimeConstant);
    gain.linearRampToValueAtTime(0, decayEndTime);
  }
}
