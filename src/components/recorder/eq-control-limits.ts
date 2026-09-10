import { EQ_LIMITS } from "../../lib/dsp/biquad-eq";

export const EQ_CONTROL_LIMITS = {
  frequency: { ...EQ_LIMITS.frequency, step: 1 },
  gainDb: { ...EQ_LIMITS.gainDb, step: 0.1 },
  q: { ...EQ_LIMITS.q, step: 0.1 },
};
