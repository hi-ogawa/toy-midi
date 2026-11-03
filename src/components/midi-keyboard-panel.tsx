import { useEffect, useState } from "react";
import { ABLETON_KEYMAP } from "../lib/computer-keyboard";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";
import {
  ComputerKeyboardLayout,
  MidiKeyboardPiano,
} from "./midi-keyboard-keys";
import { Panel } from "./panel";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { cn } from "./ui/utils";
import { useMidiKeyboard } from "./use-midi-keyboard";

export function MidiKeyboardPanel({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const { keyboard, heldPitches, octave, velocity } = useMidiKeyboard({
    send: (message) => runtime.playLiveMidiMessage(message),
    keymap: ABLETON_KEYMAP,
    capturesKeys: isCapturing,
  });
  const monitoredTrack = state.midiTracks.find(
    (track) => track.id === state.midiMonitorTrackId,
  );

  function toggleCapture(): void {
    keyboard.releaseAll();
    setIsCapturing(!isCapturing);
  }

  useEffect(() => () => keyboard.releaseAll(), [keyboard]);

  return (
    <Panel
      title="MIDI Keyboard"
      closeLabel="Close MIDI Keyboard"
      onClose={() => runtime.setMidiKeyboardOpen(false)}
      data-testid="midi-keyboard-panel"
      className="pointer-events-auto shrink-0"
      contentClassName="grid w-[732px] gap-3 px-4 py-3"
    >
      <div className="flex items-center gap-4 text-xs text-neutral-300">
        <span role="status" className="min-w-0 flex-1 truncate">
          {monitoredTrack
            ? `Playing ${monitoredTrack.name}`
            : "Turn on input monitoring on a MIDI track to hear this"}
        </span>
        <div className="flex w-48 items-center gap-2">
          <span>Velocity</span>
          <Slider
            aria-label="Velocity"
            value={[velocity]}
            min={1}
            max={127}
            onValueChange={([next]) => keyboard.setVelocity(next)}
          />
          <span className="w-6 text-right tabular-nums">{velocity}</span>
        </div>
        <Button
          aria-pressed={isCapturing}
          onClick={toggleCapture}
          className={cn(
            "h-7 px-2 text-xs",
            isCapturing
              ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
              : "bg-neutral-700 hover:bg-neutral-600",
          )}
        >
          Computer keys
        </Button>
      </div>

      <MidiKeyboardPiano
        keyboard={keyboard}
        heldPitches={heldPitches}
        className="h-24"
      />

      {isCapturing && (
        <ComputerKeyboardLayout
          keymap={ABLETON_KEYMAP}
          octave={octave}
          heldPitches={heldPitches}
        />
      )}
    </Panel>
  );
}
