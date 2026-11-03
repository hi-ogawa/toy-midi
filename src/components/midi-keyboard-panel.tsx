import {
  CircleHelpIcon,
  KeyboardIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ABLETON_KEYMAP, getComputerKeyLabels } from "../lib/computer-keyboard";
import {
  PITCH_BEND_RANGE,
  PITCH_WHEEL_CENTER,
  PITCH_WHEEL_MAX,
} from "../lib/general-midi";
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
import { Knob } from "./ui/knob";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useMidiKeyboard } from "./use-midi-keyboard";
import { usePointerDrag } from "./use-pointer-drag";

const WHITE_KEY_WIDTH = 28;
const PANEL_CHROME_WIDTH = 26;
const MOD_WHEEL_CONTROLLER = 1;
const SEMITONE_BEND = PITCH_WHEEL_CENTER / PITCH_BEND_RANGE;

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
    minSize: { width: 334, height: 180 },
    onResizeEnd: (midiKeyboardSize) =>
      projectUiStore.update({ midiKeyboardSize }),
  });
  const {
    keyboard,
    heldPitches,
    octave,
    velocity,
    pitchBend,
    controllerValues,
  } = useMidiKeyboard({
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
      <div className="flex items-center justify-between gap-3">
        <OctaveStepper
          keyboard={keyboard}
          octave={octave}
          lowestPitch={lowestPitch}
        />
        <ValueKnob
          label="Pitch bend"
          shortLabel="Bend"
          value={pitchBend}
          displayValue={formatPitchBend(pitchBend)}
          min={0}
          max={PITCH_WHEEL_MAX}
          origin={PITCH_WHEEL_CENTER}
          step={SEMITONE_BEND}
          onChange={(value) => keyboard.setPitchBend(value)}
          onRelease={() => keyboard.releasePitchBend()}
        />
        <ValueKnob
          label="Mod wheel"
          shortLabel="Mod"
          value={controllerValues[MOD_WHEEL_CONTROLLER]}
          min={0}
          max={127}
          onChange={(value) =>
            keyboard.setController({ controller: MOD_WHEEL_CONTROLLER, value })
          }
        />
        <ValueKnob
          label="Velocity"
          shortLabel="Vel"
          value={velocity}
          min={MIN_VELOCITY}
          max={MAX_VELOCITY}
          onChange={(value) => keyboard.setVelocity(value)}
        />
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
  const buttonClassName =
    "flex h-full w-5 items-center justify-center text-neutral-400 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex h-6 items-center rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-300">
      <button
        type="button"
        aria-label="Octave down"
        disabled={octave === MIN_OCTAVE}
        onClick={() => keyboard.shiftOctave(-1)}
        className={buttonClassName}
      >
        <MinusIcon className="size-3" />
      </button>
      <span className="w-5 text-center tabular-nums">
        {formatChromaticPitch(lowestPitch)}
      </span>
      <button
        type="button"
        aria-label="Octave up"
        disabled={octave === MAX_OCTAVE}
        onClick={() => keyboard.shiftOctave(1)}
        className={buttonClassName}
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  );
}

function ValueKnob({
  label,
  shortLabel,
  value,
  displayValue = value,
  min,
  max,
  origin,
  step = 1,
  onChange,
  onRelease,
}: {
  label: string;
  shortLabel: string;
  value: number;
  displayValue?: number | string;
  min: number;
  max: number;
  origin?: number;
  step?: number;
  onChange: (value: number) => void;
  onRelease?: () => void;
}) {
  const setValue = (next: number) =>
    onChange(clamp(Math.round(next), min, max));
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return value;
    },
    onMove: (_event, drag) =>
      setValue(drag.data - (drag.deltaY / 200) * (max - min)),
    onEnd: onRelease,
    onCancel: onRelease,
  });
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-300">
      <Knob
        ref={ref}
        aria-label={label}
        onKeyDown={(event) => {
          const delta = event.shiftKey ? 10 * step : step;
          const next = {
            ArrowLeft: value - delta,
            ArrowDown: value - delta,
            ArrowRight: value + delta,
            ArrowUp: value + delta,
            Home: min,
            End: max,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setValue(next);
          }
        }}
        onKeyUp={onRelease}
        value={value}
        min={min}
        max={max}
        origin={origin}
        className="cursor-ns-resize"
      />
      <div className="grid w-6 gap-1 leading-none">
        <span>{shortLabel}</span>
        <span className="tabular-nums">{displayValue}</span>
      </div>
    </div>
  );
}

function formatPitchBend(pitchBend: number): string {
  const semitones = Math.round(
    ((pitchBend - PITCH_WHEEL_CENTER) / PITCH_WHEEL_CENTER) * PITCH_BEND_RANGE,
  );
  return semitones > 0 ? `+${semitones}` : `${semitones}`;
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
