import { useQuery } from "@tanstack/react-query";
import {
  CircleHelpIcon,
  ExternalLinkIcon,
  HouseIcon,
  KeyboardMusicIcon,
  MinusIcon,
  MoreVerticalIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  COMPUTER_KEYBOARD_ROWS,
  formatComputerKey,
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import { LIVE_CONTROLLER_SETTINGS, PITCH_WHEEL_MAX } from "../lib/general-midi";
import {
  encodeMidiDeviceMessage,
  requestMidiAccess,
  subscribeMidiOutputs,
} from "../lib/midi-device";
import {
  MAX_OCTAVE,
  MIN_OCTAVE,
  type MidiKeyboard,
} from "../lib/midi-keyboard";
import { isBlackKey } from "../lib/music";
import { formatChromaticPitch } from "../lib/pitch-spelling";
import { routes } from "../lib/routes";
import { range } from "../utils/array";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Slider } from "./ui/slider";
import { cn } from "./ui/utils";
import { useMidiKeyboard } from "./use-midi-keyboard";

const LOWEST_PITCH = 24;
const HIGHEST_PITCH = 108;
const PITCHES = range(HIGHEST_PITCH - LOWEST_PITCH + 1).map(
  (i) => LOWEST_PITCH + i,
);
const WHITE_KEY_COUNT = PITCHES.filter((pitch) => !isBlackKey(pitch)).length;

const COMPUTER_KEY_STEP = 40;
const DEMO_TRACK_HREF = `${routes.draft.href()}?src=/midi-keyboard-demo.json`;

export function MidiKeyboardPage() {
  useEffect(() => {
    document.title = "MIDI Keyboard - Toy MIDI";
  }, []);

  return (
    <main className="h-screen overflow-y-auto bg-neutral-900 text-neutral-100">
      <header className="sticky top-0 z-10 flex h-[53px] items-center border-b border-neutral-700 bg-neutral-800 px-4 text-neutral-100 shadow-sm">
        <KeyboardMusicIcon className="mr-2 size-5 text-emerald-400" />
        <span className="font-medium">MIDI Keyboard</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              title="MIDI keyboard menu"
              aria-label="MIDI keyboard menu"
              className="size-9 hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={routes.home.href()}>
                <HouseIcon />
                Home
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <p className="text-base text-neutral-400">
          A virtual MIDI controller. It makes no sound by itself.
        </p>
        <div className="mt-8">
          <MidiKeyboardControls />
        </div>
      </div>
    </main>
  );
}

function MidiKeyboardControls() {
  const accessQuery = useQuery({
    queryKey: ["midi-output-access"],
    retry: false,
    staleTime: Infinity,
    queryFn: requestMidiAccess,
  });
  const access = accessQuery.data;

  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  useEffect(() => {
    if (access) {
      return subscribeMidiOutputs(access, setOutputs);
    }
  }, [access]);

  const [selectedId, setSelectedId] = useState<string>();
  const output =
    outputs.find((output) => output.id === selectedId) ?? outputs[0];

  const {
    keyboard,
    heldPitches,
    octave,
    velocity,
    pitchBend,
    controllerValues,
  } = useMidiKeyboard({
    send: (message) => output?.send(encodeMidiDeviceMessage(message)),
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="midi-output"
            className="text-xs font-semibold text-neutral-400"
          >
            MIDI output
          </label>
          <MidiOutputHelp />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-full max-w-md">
            <select
              id="midi-output"
              value={output?.id ?? ""}
              disabled={!output}
              onChange={(event) => {
                keyboard.releaseAll();
                setSelectedId(event.currentTarget.value);
              }}
              className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {outputs.length === 0 && (
                <option>
                  {accessQuery.isPending
                    ? "Waiting for MIDI access..."
                    : "No MIDI outputs found"}
                </option>
              )}
              {outputs.map((output) => (
                <option key={output.id} value={output.id}>
                  {output.name || "Unnamed output"}
                </option>
              ))}
            </select>
          </div>
          <a
            href={DEMO_TRACK_HREF}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-neutral-700 px-3 text-sm text-neutral-100 hover:bg-neutral-800"
          >
            Open demo track
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
        {accessQuery.isError && (
          <p role="alert" className="text-xs text-red-400">
            MIDI access isn't available: {accessQuery.error.message}
          </p>
        )}
        {access && outputs.length === 0 && (
          <p className="text-xs text-neutral-400">
            To send to another app, set up a loopback port, such as the IAC
            Driver on macOS.
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-6">
        <ControlSlider
          label="Velocity"
          value={velocity}
          min={1}
          max={127}
          onChange={(value) => keyboard.setVelocity(value)}
        />
        {LIVE_CONTROLLER_SETTINGS.map(({ label, controller }) => (
          <ControlSlider
            key={controller}
            label={label}
            value={controllerValues[controller]}
            min={0}
            max={127}
            onChange={(value) => keyboard.setController({ controller, value })}
          />
        ))}
        <ControlSlider
          label="Pitch bend"
          value={pitchBend}
          min={0}
          max={PITCH_WHEEL_MAX}
          onChange={(value) => keyboard.setPitchBend(value)}
          onRelease={() => keyboard.releasePitchBend()}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-300">
        <Button
          aria-label="Octave down"
          disabled={octave === MIN_OCTAVE}
          onClick={() => keyboard.shiftOctave(-1)}
          className="size-7 hover:bg-accent hover:text-accent-foreground"
        >
          <MinusIcon className="size-4" />
        </Button>
        <span className="w-16 text-center tabular-nums">
          Octave {octave > 0 ? `+${octave}` : octave}
        </span>
        <Button
          aria-label="Octave up"
          disabled={octave === MAX_OCTAVE}
          onClick={() => keyboard.shiftOctave(1)}
          className="size-7 hover:bg-accent hover:text-accent-foreground"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div
        className="relative h-40 select-none"
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
      <ComputerKeyboardLayout octave={octave} heldPitches={heldPitches} />
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
        keyboard.pressPointer(pitch);
      }}
      onPointerEnter={() => keyboard.slidePointer(pitch)}
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

function MidiOutputHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About loopback ports"
          className="text-neutral-500 hover:text-neutral-200"
        >
          <CircleHelpIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3 text-xs">
        <p>
          A loopback port passes MIDI to another app on this computer. Examples
          are Midi Through on Linux and the IAC Driver on macOS.
        </p>
        <p>
          To play the editor, open the demo track, select the same port under
          MIDI Device, and turn on Monitor.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ComputerKeyboardLayout({
  octave,
  heldPitches,
}: {
  octave: number;
  heldPitches: ReadonlySet<number>;
}) {
  return (
    <div className="mx-auto w-fit">
      <h2 className="mb-2 text-xs font-semibold text-neutral-400">
        Computer keyboard
      </h2>
      <div
        role="img"
        aria-label="Computer keyboard layout"
        className="grid gap-1 select-none"
      >
        {COMPUTER_KEYBOARD_ROWS.map(({ stagger, codes }) => (
          <div
            key={stagger}
            className="flex gap-1"
            style={{ marginLeft: stagger * COMPUTER_KEY_STEP }}
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

function ControlSlider({
  label,
  value,
  min,
  max,
  onChange,
  onRelease,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onRelease?: () => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex justify-between text-xs text-neutral-300">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        onValueChange={([next]) => onChange(next)}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
      />
    </div>
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
