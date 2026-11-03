import { useQuery } from "@tanstack/react-query";
import {
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
import { MAX_OCTAVE, MIN_OCTAVE } from "../lib/midi-keyboard";
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
  const accessQuery = useQuery({
    queryKey: ["midi-output-access"],
    retry: false,
    staleTime: Infinity,
    queryFn: requestMidiAccess,
  });

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
        <div className="grid max-w-2xl gap-3 text-base leading-7 text-neutral-400">
          <p>
            A virtual MIDI controller in your browser. It sends notes and
            controller changes to the MIDI output you choose, and makes no sound
            by itself. To hear it, connect a synth, or send to another app
            through a loopback port, such as Midi Through on Linux or the IAC
            Driver on macOS.
          </p>
          <p>
            The Toy MIDI editor can also listen on a loopback port. Open a{" "}
            <a
              href={DEMO_TRACK_HREF}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              demo track
            </a>{" "}
            in a new tab, select the same port under MIDI Device, and turn on
            Monitor.
          </p>
        </div>
        <div className="mt-8">
          {accessQuery.data ? (
            <MidiKeyboardControls access={accessQuery.data} />
          ) : accessQuery.isError ? (
            <p role="alert" className="text-sm text-red-400">
              MIDI access isn't available: {accessQuery.error.message}
            </p>
          ) : (
            <p className="text-sm text-neutral-400">
              Waiting for MIDI access...
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function MidiKeyboardControls({ access }: { access: MIDIAccess }) {
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  useEffect(() => subscribeMidiOutputs(access, setOutputs), [access]);

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
      <label className="grid max-w-md gap-2 text-xs font-semibold text-neutral-400">
        MIDI output
        <select
          value={output?.id ?? ""}
          disabled={!output}
          onChange={(event) => {
            keyboard.releaseAll();
            setSelectedId(event.currentTarget.value);
          }}
          className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {outputs.length === 0 && <option>No MIDI outputs found</option>}
          {outputs.map((output) => (
            <option key={output.id} value={output.id}>
              {output.name || "Unnamed output"}
            </option>
          ))}
        </select>
      </label>

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
          <button
            key={pitch}
            type="button"
            tabIndex={-1}
            aria-label={formatChromaticPitch(pitch)}
            aria-pressed={heldPitches.has(pitch)}
            style={getKeyStyle(pitch)}
            onPointerDown={(event) => {
              // Keeps focus where it is, so a key can't also press this button.
              event.preventDefault();
              keyboard.pressPointer(pitch);
            }}
            onPointerEnter={() => keyboard.slidePointer(pitch)}
            className={cn(
              "absolute top-0 flex items-end justify-center rounded-b pb-1 text-[10px] text-neutral-500",
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
      <ComputerKeyboardLayout octave={octave} heldPitches={heldPitches} />
    </div>
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
