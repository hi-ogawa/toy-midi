import {
  COMPUTER_KEYBOARD_ROWS,
  formatComputerKey,
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import type { MidiKeyboard } from "../lib/midi-keyboard";
import { isBlackKey } from "../lib/music";
import { formatChromaticPitch } from "../lib/pitch-spelling";
import { range } from "../utils/array";
import { cn } from "./ui/utils";

const LOWEST_PITCH = 24;
const HIGHEST_PITCH = 108;
const PITCHES = range(HIGHEST_PITCH - LOWEST_PITCH + 1).map(
  (i) => LOWEST_PITCH + i,
);
const WHITE_KEY_COUNT = PITCHES.filter((pitch) => !isBlackKey(pitch)).length;

export function MidiKeyboardPiano({
  keyboard,
  heldPitches,
  className,
}: {
  keyboard: MidiKeyboard;
  heldPitches: ReadonlySet<number>;
  className: string;
}) {
  return (
    <div
      className={cn("relative touch-none select-none", className)}
      role="group"
      aria-label="Piano"
    >
      {PITCHES.map((pitch) => (
        <PianoKey
          key={pitch}
          pitch={pitch}
          isHeld={heldPitches.has(pitch)}
          keyboard={keyboard}
        />
      ))}
    </div>
  );
}

function PianoKey({
  pitch,
  isHeld,
  keyboard,
}: {
  pitch: number;
  isHeld: boolean;
  keyboard: MidiKeyboard;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={formatChromaticPitch(pitch)}
      aria-pressed={isHeld}
      style={getKeyStyle(pitch)}
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
        "absolute top-0 flex items-end justify-center rounded-b pb-1 text-[10px] text-neutral-500",
        isBlackKey(pitch) ? "z-10 h-[60%]" : "h-full border border-neutral-400",
        isBlackKey(pitch)
          ? isHeld
            ? "bg-emerald-600"
            : "bg-neutral-950"
          : isHeld
            ? "bg-emerald-400 text-neutral-900"
            : "bg-neutral-100",
      )}
    >
      {pitch % 12 === 0 && formatChromaticPitch(pitch)}
    </button>
  );
}

export function ComputerKeyboardLayout({
  octave,
  heldPitches,
}: {
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
                pitch={getComputerKeyPitch({ code, octave })}
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
  pitch,
  heldPitches,
}: {
  code: string;
  pitch?: number;
  heldPitches: ReadonlySet<number>;
}) {
  const shift = getComputerKeyOctaveShift(code);
  const hint =
    pitch !== undefined
      ? formatChromaticPitch(pitch)
      : shift !== undefined
        ? `Oct ${shift < 0 ? "-" : "+"}`
        : undefined;
  return (
    <span
      className={cn(
        "flex size-9 flex-col items-center justify-center rounded text-xs leading-tight font-medium",
        getComputerKeyColor({ code, pitch, heldPitches }),
      )}
    >
      {formatComputerKey(code)}
      {hint && <span className="text-[9px] font-normal">{hint}</span>}
    </span>
  );
}

function getComputerKeyColor({
  code,
  pitch,
  heldPitches,
}: {
  code: string;
  pitch?: number;
  heldPitches: ReadonlySet<number>;
}): string {
  if (pitch === undefined) {
    return getComputerKeyOctaveShift(code) !== undefined
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

function getKeyStyle(pitch: number) {
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
