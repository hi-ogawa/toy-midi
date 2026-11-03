import type { CSSProperties } from "react";
import {
  COMPUTER_KEYBOARD_ROWS,
  type ComputerKeymap,
  formatComputerKey,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import type { MidiKeyboard } from "../lib/midi-keyboard";
import { clamp, isBlackKey } from "../lib/music";
import { formatChromaticPitch } from "../lib/pitch-spelling";
import { range } from "../utils/array";
import { cn } from "./ui/utils";

const LOWEST_PITCH = 24;
const HIGHEST_PITCH = 108;
export const PIANO_PITCHES = range(HIGHEST_PITCH - LOWEST_PITCH + 1).map(
  (i) => LOWEST_PITCH + i,
);
const WHITE_PITCHES = PIANO_PITCHES.filter((pitch) => !isBlackKey(pitch));

/** Picks whole white keys centered on two white pitches, within the piano. */
export function getPianoPitchesAround({
  lowestPitch,
  highestPitch,
  whiteKeyCount,
}: {
  lowestPitch: number;
  highestPitch: number;
  whiteKeyCount: number;
}): number[] {
  const count = Math.min(whiteKeyCount, WHITE_PITCHES.length);
  const lowestIndex = WHITE_PITCHES.indexOf(lowestPitch);
  const spareKeys =
    count - (WHITE_PITCHES.indexOf(highestPitch) - lowestIndex + 1);
  const start = clamp(
    lowestIndex - Math.floor(spareKeys / 2),
    0,
    WHITE_PITCHES.length - count,
  );
  const first = WHITE_PITCHES[start];
  const last = WHITE_PITCHES[start + count - 1];
  return PIANO_PITCHES.filter((pitch) => pitch >= first && pitch <= last);
}

export function MidiKeyboardPiano({
  keyboard,
  pitches,
  heldPitches,
  keyLabels,
  className,
}: {
  keyboard: MidiKeyboard;
  pitches: readonly number[];
  heldPitches: ReadonlySet<number>;
  /** The computer key on each pitch. Keys without one look out of reach. */
  keyLabels?: ReadonlyMap<number, string>;
  className: string;
}) {
  return (
    <div
      className={cn("relative touch-none select-none", className)}
      role="group"
      aria-label="Piano"
    >
      {pitches.map((pitch) => (
        <PianoKey
          key={pitch}
          pitch={pitch}
          style={getKeyStyle(pitch, pitches)}
          isHeld={heldPitches.has(pitch)}
          keyLabel={keyLabels?.get(pitch)}
          isOutOfReach={keyLabels !== undefined && !keyLabels.has(pitch)}
          keyboard={keyboard}
        />
      ))}
    </div>
  );
}

function PianoKey({
  pitch,
  style,
  isHeld,
  keyLabel,
  isOutOfReach,
  keyboard,
}: {
  pitch: number;
  style: CSSProperties;
  isHeld: boolean;
  keyLabel?: string;
  isOutOfReach: boolean;
  keyboard: MidiKeyboard;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={formatChromaticPitch(pitch)}
      aria-pressed={isHeld}
      style={style}
      onPointerDown={(event) => {
        // Keeps focus where it is, so a key can't also press this button.
        event.preventDefault();
        // A touch stays captured by its first key, which would stop it sliding.
        event.currentTarget.releasePointerCapture(event.pointerId);
        keyboard.pressPointer({ pointerId: event.pointerId, pitch });
      }}
      onPointerEnter={(event) =>
        keyboard.slidePointer({ pointerId: event.pointerId, pitch })
      }
      className={cn(
        "absolute top-0 flex flex-col items-center justify-end rounded-b pb-1 text-[10px] leading-tight text-neutral-500",
        isBlackKey(pitch) ? "z-10 h-[60%]" : "h-full border border-neutral-400",
        isBlackKey(pitch)
          ? isHeld
            ? "bg-emerald-600 text-neutral-100"
            : cn(
                "text-neutral-300",
                isOutOfReach ? "bg-neutral-700" : "bg-neutral-950",
              )
          : isHeld
            ? "bg-emerald-400 text-neutral-900"
            : isOutOfReach
              ? "bg-neutral-300"
              : "bg-neutral-100",
      )}
    >
      {keyLabel && (
        <span
          className={cn(
            "font-medium",
            !isBlackKey(pitch) && "text-neutral-900",
          )}
        >
          {keyLabel}
        </span>
      )}
      {pitch % 12 === 0 && <span>{formatChromaticPitch(pitch)}</span>}
    </button>
  );
}

export function ComputerKeyboardLayout({
  keymap,
  octave,
  heldPitches,
}: {
  keymap: ComputerKeymap;
  octave: number;
  heldPitches: ReadonlySet<number>;
}) {
  return (
    <div className="mx-auto w-fit">
      <h2 className="mb-2 text-xs font-semibold text-neutral-400">
        Keyboard shortcuts
      </h2>
      <div
        role="img"
        aria-label="Keyboard shortcuts"
        className="grid gap-1 select-none"
      >
        {COMPUTER_KEYBOARD_ROWS.map(({ stagger, codes }) => (
          // A key is one step of size-9 plus gap-1, in pixels.
          <div
            key={stagger}
            className="flex gap-1"
            style={{ marginLeft: stagger * 40 }}
          >
            {codes.map((code) => (
              <ComputerKey
                key={code}
                code={code}
                keymap={keymap}
                pitch={getComputerKeyPitch({ keymap, code, octave })}
                heldPitches={heldPitches}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComputerKey({
  code,
  keymap,
  pitch,
  heldPitches,
}: {
  code: string;
  keymap: ComputerKeymap;
  pitch?: number;
  heldPitches: ReadonlySet<number>;
}) {
  const hint =
    pitch !== undefined
      ? formatChromaticPitch(pitch)
      : getComputerKeyCommandHint(keymap, code);
  return (
    <span
      className={cn(
        "flex size-9 flex-col items-center justify-center rounded text-xs leading-tight font-medium",
        getComputerKeyColor({
          pitch,
          isCommand: hint !== undefined,
          heldPitches,
        }),
      )}
    >
      {formatComputerKey(code)}
      {hint && <span className="text-[9px] font-normal">{hint}</span>}
    </span>
  );
}

function getComputerKeyCommandHint(
  keymap: ComputerKeymap,
  code: string,
): string | undefined {
  const octaveShift = keymap.octaveKeys.get(code);
  if (octaveShift !== undefined) {
    return `Oct ${octaveShift < 0 ? "-" : "+"}`;
  }
  const velocityShift = keymap.velocityKeys?.get(code);
  if (velocityShift !== undefined) {
    return `Vel ${velocityShift < 0 ? "-" : "+"}`;
  }
}

function getComputerKeyColor({
  pitch,
  isCommand,
  heldPitches,
}: {
  pitch?: number;
  isCommand: boolean;
  heldPitches: ReadonlySet<number>;
}): string {
  if (pitch === undefined) {
    return isCommand
      ? "border border-neutral-500 text-neutral-200"
      : "border border-neutral-800 text-neutral-600";
  }
  if (isBlackKey(pitch)) {
    return heldPitches.has(pitch)
      ? "bg-emerald-600 text-neutral-100"
      : "border border-neutral-600 bg-neutral-950 text-neutral-200";
  }
  return heldPitches.has(pitch)
    ? "bg-emerald-400 text-neutral-900"
    : "bg-neutral-100 text-neutral-900";
}

function getKeyStyle(pitch: number, pitches: readonly number[]): CSSProperties {
  const whitePitches = pitches.filter((other) => !isBlackKey(other));
  const whiteKeysBelow = whitePitches.filter((other) => other < pitch).length;
  const whiteKeyWidth = 100 / whitePitches.length;
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
