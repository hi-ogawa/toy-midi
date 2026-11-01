// See [ADSR envelopes](../../../docs/concepts/adsr-envelopes.md).

/** ADSR settings, with times in seconds and sustain as a level from 0 to 1 */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const ATTACK_OVERSHOOT = 0.3;
const DECAY_OVERSHOOT = 0.0001;

interface Stage {
  target: number;
  coefficient: number;
}

/** Per-sample curves for an envelope */
export interface EnvelopeCurves {
  attack: Stage;
  decay: Stage;
  sustain: number;
  release: Stage;
}

export function computeEnvelopeCurves(
  envelope: Envelope,
  sampleRate: number,
): EnvelopeCurves {
  return {
    attack: {
      target: 1 + ATTACK_OVERSHOOT,
      coefficient: computeCoefficient(
        envelope.attack * sampleRate,
        ATTACK_OVERSHOOT,
      ),
    },
    decay: {
      target: envelope.sustain - DECAY_OVERSHOOT,
      coefficient: computeCoefficient(
        envelope.decay * sampleRate,
        DECAY_OVERSHOOT,
      ),
    },
    sustain: envelope.sustain,
    release: {
      target: -DECAY_OVERSHOOT,
      coefficient: computeCoefficient(
        envelope.release * sampleRate,
        DECAY_OVERSHOOT,
      ),
    },
  };
}

function computeCoefficient(samples: number, overshoot: number): number {
  if (samples <= 0) {
    return 0;
  }
  return Math.exp(-Math.log((1 + overshoot) / overshoot) / samples);
}

/**
 * One note's position on an envelope, from attack to idle. It takes the curves
 * on each sample instead of keeping its own, so an envelope edit reaches notes
 * already sounding.
 */
export class EnvelopeState {
  stage: "attack" | "decay" | "sustain" | "release" | "idle" = "attack";
  level = 0;

  /** Advances one sample and returns the level. */
  advance(curves: EnvelopeCurves): number {
    switch (this.stage) {
      case "attack": {
        this.level = approach(this.level, curves.attack);
        if (this.level >= 1) {
          this.level = 1;
          this.stage = "decay";
        }
        break;
      }
      case "decay": {
        this.level = approach(this.level, curves.decay);
        if (this.level <= curves.sustain) {
          this.level = curves.sustain;
          this.stage = "sustain";
        }
        break;
      }
      case "release": {
        this.level = approach(this.level, curves.release);
        if (this.level <= 0) {
          this.level = 0;
          this.stage = "idle";
        }
        break;
      }
      case "sustain": {
        // A held note keeps the level it reached, so dragging the sustain
        // slider doesn't make held notes jump.
        break;
      }
      case "idle": {
        break;
      }
    }
    return this.level;
  }

  release(): void {
    if (this.stage !== "idle") {
      this.stage = "release";
    }
  }
}

function approach(level: number, stage: Stage): number {
  return stage.target + (level - stage.target) * stage.coefficient;
}
