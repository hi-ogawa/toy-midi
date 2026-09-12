import { useState } from "react";
import { dbToGain } from "../../lib/music";
import {
  type MultibandEqState,
  RecorderMultibandEffects,
} from "../recorder/recorder-multiband-effects";
import { Button } from "../ui/button";

const INITIAL_EQ: MultibandEqState = {
  bypass: false,
  bands: [
    {
      id: "low",
      frequency: 120,
      gain: dbToGain(5),
      q: 0.8,
      bypass: false,
    },
    {
      id: "mid",
      frequency: 850,
      gain: dbToGain(-7),
      q: 2.4,
      bypass: false,
    },
    {
      id: "high",
      frequency: 4800,
      gain: dbToGain(3.5),
      q: 1.4,
      bypass: false,
    },
  ],
};

export function RecorderEffectsPreview() {
  const [open, setOpen] = useState(true);
  const [eq, setEq] = useState(INITIAL_EQ);

  if (!open) {
    return (
      <Button
        className="px-3 py-2 text-xs hover:bg-neutral-700"
        onClick={() => setOpen(true)}
      >
        Open Audio 1 Effects
      </Button>
    );
  }

  return (
    <RecorderMultibandEffects
      label="Audio 1"
      eq={eq}
      onChange={setEq}
      onClose={() => setOpen(false)}
    />
  );
}
