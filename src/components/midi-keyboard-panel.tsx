import {
  CircleHelpIcon,
  KeyboardIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ABLETON_KEYMAP, getComputerKeyLabels } from "../lib/computer-keyboard";
import {
  MAX_OCTAVE,
  MAX_VELOCITY,
  type MidiKeyboard,
  MIN_OCTAVE,
  MIN_VELOCITY,
} from "../lib/midi-keyboard";
import { clamp } from "../lib/music";
import { formatChromaticPitch } from "../lib/pitch-spelling";
import type { ProjectUiStore } from "../lib/preferences";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";
import { getPianoPitchesAround, MidiKeyboardPiano } from "./midi-keyboard-keys";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Button } from "./ui/button";
import { Knob } from "./ui/knob";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useMidiKeyboard } from "./use-midi-keyboard";
import { usePointerDrag } from "./use-pointer-drag";

const WHITE_KEY_WIDTH = 28;
const PANEL_CHROME_WIDTH = 34;

export function MidiKeyboardPanel({
  projectUiStore,
  runtime,
  state,
  onClose,
}: {
  projectUiStore: ProjectUiStore;
  runtime: EditorRuntime;
  state: EditorRuntimeState;
  onClose: () => void;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const { size, handleRef } = usePanelResize({
    initialSize: projectUiStore.get().midiKeyboardSize,
    minSize: { width: 342, height: 180 },
    onResizeEnd: (midiKeyboardSize) =>
      projectUiStore.update({ midiKeyboardSize }),
  });
  const { keyboard, heldPitches, octave, velocity } = useMidiKeyboard({
    send: (message) => runtime.playLiveMidiMessage(message),
    keymap: ABLETON_KEYMAP,
    capturesKeys: isCapturing,
  });
  const monitoredTrack = state.midiTracks.find(
    (track) => track.id === state.midiMonitorTrackId,
  );
  const keyLabels = getComputerKeyLabels({ keymap: ABLETON_KEYMAP, octave });
  const labeledPitches = [...keyLabels.keys()];
  const lowestPitch = Math.min(...labeledPitches);

  function toggleCapture(): void {
    keyboard.releaseAll();
    setIsCapturing(!isCapturing);
  }

  useEffect(() => () => keyboard.releaseAll(), [keyboard]);

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          MIDI Keyboard
          <span
            role="status"
            className="min-w-0 truncate text-xs font-normal text-neutral-400"
          >
            {monitoredTrack?.name ?? "No track"}
          </span>
        </span>
      }
      headerActions={
        <>
          <button
            type="button"
            title="Computer keys"
            aria-pressed={isCapturing}
            onClick={toggleCapture}
            className="flex size-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-200 aria-pressed:bg-emerald-500 aria-pressed:text-neutral-950"
          >
            <KeyboardIcon className="size-4" />
          </button>
          <MidiKeyboardHelp />
        </>
      }
      closeLabel="Close MIDI Keyboard"
      onClose={onClose}
      data-testid="midi-keyboard-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="flex min-h-0 flex-1 flex-col gap-3 px-3 py-2"
      style={size}
    >
      <PanelResizeHandle handleRef={handleRef} label="Resize MIDI Keyboard" />
      <div className="flex items-center justify-between">
        <OctaveStepper
          keyboard={keyboard}
          octave={octave}
          lowestPitch={lowestPitch}
        />
        <VelocityKnob keyboard={keyboard} velocity={velocity} />
      </div>
      <MidiKeyboardPiano
        keyboard={keyboard}
        pitches={getPianoPitchesAround({
          lowestPitch,
          highestPitch: Math.max(...labeledPitches),
          whiteKeyCount: Math.floor(
            (size.width - PANEL_CHROME_WIDTH) / WHITE_KEY_WIDTH,
          ),
        })}
        heldPitches={heldPitches}
        keyLabels={isCapturing ? keyLabels : undefined}
        className="min-h-0 flex-1"
      />
    </Panel>
  );
}

function OctaveStepper({
  keyboard,
  octave,
  lowestPitch,
}: {
  keyboard: MidiKeyboard;
  octave: number;
  lowestPitch: number;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-300">
      <Button
        aria-label="Octave down"
        disabled={octave === MIN_OCTAVE}
        onClick={() => keyboard.shiftOctave(-1)}
        className="size-6 hover:bg-accent hover:text-accent-foreground"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <span className="w-6 text-center tabular-nums">
        {formatChromaticPitch(lowestPitch)}
      </span>
      <Button
        aria-label="Octave up"
        disabled={octave === MAX_OCTAVE}
        onClick={() => keyboard.shiftOctave(1)}
        className="size-6 hover:bg-accent hover:text-accent-foreground"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function VelocityKnob({
  keyboard,
  velocity,
}: {
  keyboard: MidiKeyboard;
  velocity: number;
}) {
  const setVelocity = (next: number) =>
    keyboard.setVelocity(clamp(Math.round(next), MIN_VELOCITY, MAX_VELOCITY));
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return velocity;
    },
    onMove: (_event, drag) =>
      setVelocity(
        drag.data - (drag.deltaY / 200) * (MAX_VELOCITY - MIN_VELOCITY),
      ),
  });
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-300">
      <Knob
        ref={ref}
        aria-label="Velocity"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const next = {
            ArrowLeft: velocity - step,
            ArrowDown: velocity - step,
            ArrowRight: velocity + step,
            ArrowUp: velocity + step,
            Home: MIN_VELOCITY,
            End: MAX_VELOCITY,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setVelocity(next);
          }
        }}
        value={velocity}
        min={MIN_VELOCITY}
        max={MAX_VELOCITY}
        className="cursor-ns-resize"
      />
      <span className="tabular-nums">Vel {velocity}</span>
    </div>
  );
}

function MidiKeyboardHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="MIDI Keyboard help"
        className="text-neutral-400 hover:text-neutral-200"
      >
        <CircleHelpIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="grid w-64 gap-2 p-3 text-xs text-neutral-300"
      >
        <p>Turn on Monitor on a MIDI track to hear this keyboard.</p>
        <p>
          With computer keys on, the keys marked on the piano play notes instead
          of editor shortcuts such as F and L.
        </p>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          <dt>
            <KeyHint>Z</KeyHint> <KeyHint>X</KeyHint>
          </dt>
          <dd>Octave down, up</dd>
          <dt>
            <KeyHint>C</KeyHint> <KeyHint>V</KeyHint>
          </dt>
          <dd>Velocity down, up</dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function KeyHint({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-b-2 border-neutral-600 bg-neutral-700/60 px-1.5 py-0.5 font-sans text-[11px] text-neutral-300">
      {children}
    </kbd>
  );
}
