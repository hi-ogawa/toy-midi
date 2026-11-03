import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  COMPUTER_NOTE_KEYS,
  formatComputerKey,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import { isFormInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { clamp } from "../lib/music";
import { formatChromaticPitch } from "../lib/pitch-spelling";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";
import { range } from "../utils/array";
import { Panel } from "./panel";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { cn } from "./ui/utils";
import { useSetState } from "./use-set-state";
import { useWindowEvent } from "./use-window-event";

const LOWEST_PITCH = 24;
const HIGHEST_PITCH = 108;
const BLACK_PITCH_CLASSES = [1, 3, 6, 8, 10];
const PITCHES = range(HIGHEST_PITCH - LOWEST_PITCH + 1).map(
  (i) => LOWEST_PITCH + i,
);
const WHITE_KEY_COUNT = PITCHES.filter((pitch) => !isBlackKey(pitch)).length;

const MIN_OCTAVE = -3;
const MAX_OCTAVE = 2;
const MIN_VELOCITY = 1;
const MAX_VELOCITY = 127;
const DEFAULT_VELOCITY = 100;
const VELOCITY_STEP = 20;
const COMPUTER_KEY_STEP = 32;
const COMPUTER_KEY_CLASS =
  "flex size-7 items-center justify-center rounded text-xs font-medium";

export function MidiKeyboardPanel({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
}) {
  const [velocity, setVelocity] = useState(DEFAULT_VELOCITY);
  const [octave, setOctave] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [heldPitches, heldPitchActions] = useSetState<number>();
  const [pointerPitch, setPointerPitch] = useState<number>();
  // A key releases the pitch it started, even if the octave changed since.
  const heldKeyPitches = useRef(new Map<string, number>());
  const monitoredTrack = state.midiTracks.find(
    (track) => track.id === state.midiMonitorTrackId,
  );

  function press(pitch: number): void {
    if (!heldPitches.has(pitch)) {
      runtime.playLiveMidiMessage({ type: "note-on", pitch, velocity });
      heldPitchActions.add(pitch);
    }
  }

  function release(pitch: number): void {
    if (heldPitches.has(pitch)) {
      runtime.playLiveMidiMessage({ type: "note-off", pitch });
      heldPitchActions.remove(pitch);
    }
  }

  function releaseAll(): void {
    for (const pitch of heldPitches) {
      runtime.playLiveMidiMessage({ type: "note-off", pitch });
    }
    heldPitchActions.replace(new Set());
    heldKeyPitches.current.clear();
    setPointerPitch(undefined);
  }

  function toggleCapture(): void {
    releaseAll();
    setIsCapturing(!isCapturing);
  }

  function shiftOctave(delta: number): void {
    setOctave(clamp(octave + delta, MIN_OCTAVE, MAX_OCTAVE));
  }

  function shiftVelocity(delta: number): void {
    setVelocity(clamp(velocity + delta, MIN_VELOCITY, MAX_VELOCITY));
  }

  function getCapturedKeyAction(code: string): (() => void) | undefined {
    const pitch = getComputerKeyPitch({ code, octave });
    if (pitch !== undefined) {
      return () => {
        heldKeyPitches.current.set(code, pitch);
        press(pitch);
      };
    }
    switch (code) {
      case "KeyZ": {
        return () => shiftOctave(-1);
      }
      case "KeyX": {
        return () => shiftOctave(1);
      }
      case "KeyC": {
        return () => shiftVelocity(-VELOCITY_STEP);
      }
      case "KeyV": {
        return () => shiftVelocity(VELOCITY_STEP);
      }
    }
  }

  // Capture phase, because modal dialogs stop keys from reaching the window,
  // and auditioning presets happens in one.
  useWindowEvent(
    "keydown",
    (event) => {
      if (isFormInputTarget(event.target)) {
        return;
      }
      if (matchKeyboardEvent(event, "Shift+C")) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          toggleCapture();
        }
        return;
      }
      if (
        !isCapturing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const action = getCapturedKeyAction(event.code);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          action();
        }
      }
    },
    true,
  );
  useWindowEvent(
    "keyup",
    (event) => {
      const pitch = heldKeyPitches.current.get(event.code);
      if (pitch !== undefined) {
        heldKeyPitches.current.delete(event.code);
        release(pitch);
      }
    },
    true,
  );
  useWindowEvent("pointerup", () => {
    if (pointerPitch !== undefined) {
      release(pointerPitch);
      setPointerPitch(undefined);
    }
  });
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", releaseAll);

  const releaseOnClose = useEffectEvent(releaseAll);
  useEffect(() => () => releaseOnClose(), []);

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
            min={MIN_VELOCITY}
            max={MAX_VELOCITY}
            onValueChange={([next]) => setVelocity(next)}
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

      <div
        className="relative h-24 select-none"
        role="group"
        aria-label="Piano"
      >
        {PITCHES.map((pitch) => (
          <button
            key={pitch}
            type="button"
            tabIndex={-1}
            aria-label={formatChromaticPitch(pitch)}
            aria-pressed={heldPitches.has(pitch)}
            style={getPianoKeyStyle(pitch)}
            onPointerDown={(event) => {
              // Keeps focus where it is, so a key can't also press this button.
              event.preventDefault();
              press(pitch);
              setPointerPitch(pitch);
            }}
            onPointerEnter={() => {
              if (pointerPitch !== undefined) {
                release(pointerPitch);
                press(pitch);
                setPointerPitch(pitch);
              }
            }}
            className={cn(
              "absolute top-0 flex items-end justify-center rounded-b pb-0.5 text-[9px] text-neutral-500",
              isBlackKey(pitch)
                ? "z-10 h-[60%]"
                : "h-full border border-neutral-400",
              isBlackKey(pitch)
                ? heldPitches.has(pitch)
                  ? "bg-emerald-600"
                  : "bg-neutral-950"
                : heldPitches.has(pitch)
                  ? "bg-emerald-400 text-neutral-900"
                  : "bg-neutral-100",
            )}
          >
            {pitch % 12 === 0 && formatChromaticPitch(pitch)}
          </button>
        ))}
      </div>

      {isCapturing && (
        <ComputerKeyboardLayout
          octave={octave}
          velocity={velocity}
          heldPitches={heldPitches}
        />
      )}
    </Panel>
  );
}

function ComputerKeyboardLayout({
  octave,
  velocity,
  heldPitches,
}: {
  octave: number;
  velocity: number;
  heldPitches: ReadonlySet<number>;
}) {
  const pitches = COMPUTER_NOTE_KEYS.map(
    (code) => getComputerKeyPitch({ code, octave }) ?? 0,
  );
  return (
    <div
      role="img"
      aria-label="Computer keyboard layout"
      className="flex select-none items-end gap-6 text-xs text-neutral-400"
    >
      <div className="flex items-end gap-2">
        <span className="pb-1.5 tabular-nums">
          {formatChromaticPitch(pitches[0])}
        </span>
        <div className="relative h-[60px] w-[352px]">
          {COMPUTER_NOTE_KEYS.map((code, index) => {
            const pitch = pitches[index];
            const isBlack = isBlackKey(pitch);
            const whiteKeysBelow = pitches
              .slice(0, index)
              .filter((other) => !isBlackKey(other)).length;
            return (
              <span
                key={code}
                style={{
                  left:
                    (whiteKeysBelow - (isBlack ? 0.5 : 0)) * COMPUTER_KEY_STEP,
                }}
                className={cn(
                  COMPUTER_KEY_CLASS,
                  "absolute",
                  isBlack ? "top-0" : "bottom-0",
                  heldPitches.has(pitch)
                    ? isBlack
                      ? "bg-emerald-600 text-neutral-100"
                      : "bg-emerald-400 text-neutral-900"
                    : isBlack
                      ? "border border-neutral-600 bg-neutral-950 text-neutral-200"
                      : "bg-neutral-100 text-neutral-900",
                )}
              >
                {formatComputerKey(code)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="grid gap-1">
        <ComputerCommandKeys
          keys={["Z", "X"]}
          label={`Octave ${octave > 0 ? `+${octave}` : octave}`}
        />
        <ComputerCommandKeys keys={["C", "V"]} label={`Velocity ${velocity}`} />
      </div>
    </div>
  );
}

function ComputerCommandKeys({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key) => (
        <span
          key={key}
          className={cn(
            COMPUTER_KEY_CLASS,
            "border border-neutral-600 text-neutral-200",
          )}
        >
          {key}
        </span>
      ))}
      <span className="ml-1 tabular-nums">{label}</span>
    </div>
  );
}

function isBlackKey(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.includes(pitch % 12);
}

function getPianoKeyStyle(pitch: number) {
  const whiteKeysBelow = PITCHES.filter(
    (other) => other < pitch && !isBlackKey(other),
  ).length;
  const whiteKeyWidth = 100 / WHITE_KEY_COUNT;
  return isBlackKey(pitch)
    ? {
        left: `${(whiteKeysBelow - 0.3) * whiteKeyWidth}%`,
        width: `${0.6 * whiteKeyWidth}%`,
      }
    : {
        left: `${whiteKeysBelow * whiteKeyWidth}%`,
        width: `${whiteKeyWidth}%`,
      };
}
