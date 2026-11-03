import { useQuery } from "@tanstack/react-query";
import {
  HouseIcon,
  KeyboardMusicIcon,
  MinusIcon,
  MoreVerticalIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  COMPUTER_KEY_ROWS,
  formatComputerKey,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import {
  encodeMidiDeviceMessage,
  type MidiDeviceMessage,
  openMidiOutputAccess,
} from "../lib/midi-device";
import { clamp } from "../lib/music";
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
import { useSetState } from "./use-set-state";
import { useWindowEvent } from "./use-window-event";

const LOWEST_PITCH = 24;
const HIGHEST_PITCH = 108;
const MIN_OCTAVE = -2;
const MAX_OCTAVE = 2;
const BLACK_PITCH_CLASSES = [1, 3, 6, 8, 10];
const PITCHES = range(HIGHEST_PITCH - LOWEST_PITCH + 1).map(
  (i) => LOWEST_PITCH + i,
);
const WHITE_KEY_COUNT = PITCHES.filter((pitch) => !isBlackKey(pitch)).length;

const COMPUTER_KEY_STEP = 36;
const OCTAVE_KEY_CLASS =
  "flex size-8 items-center justify-center rounded border border-neutral-600 font-medium text-neutral-200";

const DEFAULT_VELOCITY = 100;
const PITCH_BEND_CENTER = 8192;
const PITCH_BEND_MAX = 16383;
const CONTROLLERS = [
  { label: "Mod wheel", controller: 1, defaultValue: 0 },
  { label: "Volume", controller: 7, defaultValue: 100 },
  { label: "Expression", controller: 11, defaultValue: 127 },
  { label: "Sustain", controller: 64, defaultValue: 0 },
  { label: "Resonance", controller: 71, defaultValue: 64 },
  { label: "Brightness", controller: 74, defaultValue: 64 },
];

export function MidiKeyboardPage() {
  const [outputs, setOutputs] = useState<MIDIOutput[]>();
  const accessQuery = useQuery({
    queryKey: ["midi-output-access"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      await openMidiOutputAccess({ onChange: setOutputs });
      return true;
    },
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
        <h1 className="text-4xl font-semibold tracking-[-0.045em]">
          Send MIDI from the browser
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-400">
          Play notes into a MIDI output. To play the editor without hardware,
          send to a loopback port, such as Midi Through on Linux, and select the
          same port as the editor's MIDI device.
        </p>
        <div className="mt-8">
          {outputs ? (
            <MidiKeyboard outputs={outputs} />
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

function MidiKeyboard({ outputs }: { outputs: MIDIOutput[] }) {
  const [selectedId, setSelectedId] = useState<string>();
  const output =
    outputs.find((output) => output.id === selectedId) ?? outputs[0];

  const [velocity, setVelocity] = useState(DEFAULT_VELOCITY);
  const [pitchBend, setPitchBend] = useState(PITCH_BEND_CENTER);
  const [controllerValues, setControllerValues] = useState(() =>
    CONTROLLERS.map((controller) => controller.defaultValue),
  );
  const [heldPitches, heldPitchActions] = useSetState<number>();
  const [pointerPitch, setPointerPitch] = useState<number>();
  const [octave, setOctave] = useState(0);
  // A key releases the pitch it started, even if the octave changed since.
  const heldKeyPitches = useRef(new Map<string, number>());

  function send(message: MidiDeviceMessage): void {
    output?.send(encodeMidiDeviceMessage(message));
  }

  function press(pitch: number): void {
    if (!heldPitches.has(pitch)) {
      send({ type: "note-on", pitch, velocity });
      heldPitchActions.add(pitch);
    }
  }

  function release(pitch: number): void {
    if (heldPitches.has(pitch)) {
      send({ type: "note-off", pitch });
      heldPitchActions.remove(pitch);
    }
  }

  function releaseAll(): void {
    for (const pitch of heldPitches) {
      send({ type: "note-off", pitch });
    }
    heldPitchActions.replace(new Set());
    heldKeyPitches.current.clear();
    setPointerPitch(undefined);
  }

  function shiftOctave(delta: number): void {
    setOctave((current) => clamp(current + delta, MIN_OCTAVE, MAX_OCTAVE));
  }

  function changePitchBend(value: number): void {
    setPitchBend(value);
    send({ type: "pitch-bend", value });
  }

  useWindowEvent("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.code === "BracketLeft" || event.code === "BracketRight") {
      event.preventDefault();
      if (!event.repeat) {
        shiftOctave(event.code === "BracketLeft" ? -1 : 1);
      }
      return;
    }
    const pitch = getComputerKeyPitch({ code: event.code, octave });
    if (pitch !== undefined) {
      // Otherwise a focused output picker takes the key for type-ahead.
      event.preventDefault();
      if (!event.repeat) {
        heldKeyPitches.current.set(event.code, pitch);
        press(pitch);
      }
    }
  });
  useWindowEvent("keyup", (event) => {
    const pitch = heldKeyPitches.current.get(event.code);
    if (pitch !== undefined) {
      heldKeyPitches.current.delete(event.code);
      release(pitch);
    }
  });
  useWindowEvent("pointerup", () => {
    if (pointerPitch !== undefined) {
      release(pointerPitch);
      setPointerPitch(undefined);
    }
  });
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", releaseAll);

  return (
    <div className="grid gap-6">
      <label className="grid max-w-md gap-2 text-xs font-semibold text-neutral-400">
        MIDI output
        <select
          value={output?.id ?? ""}
          disabled={!output}
          onChange={(event) => {
            releaseAll();
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
          onChange={setVelocity}
        />
        {CONTROLLERS.map(({ label, controller }, index) => (
          <ControlSlider
            key={controller}
            label={label}
            value={controllerValues[index]}
            min={0}
            max={127}
            onChange={(value) => {
              setControllerValues((values) => values.with(index, value));
              send({ type: "controller", controller, value });
            }}
          />
        ))}
        <ControlSlider
          label="Pitch bend"
          value={pitchBend}
          min={0}
          max={PITCH_BEND_MAX}
          onChange={changePitchBend}
          onRelease={() => {
            if (pitchBend !== PITCH_BEND_CENTER) {
              changePitchBend(PITCH_BEND_CENTER);
            }
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-300">
        <Button
          aria-label="Octave down"
          disabled={octave === MIN_OCTAVE}
          onClick={() => shiftOctave(-1)}
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
          onClick={() => shiftOctave(1)}
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
    <div
      role="img"
      aria-label="Computer keyboard layout"
      className="grid gap-3 select-none"
    >
      {COMPUTER_KEY_ROWS.map(({ startPitch, codes }, rowIndex) => {
        const lowestPitch = startPitch + octave * 12;
        return (
          <div key={startPitch} className="flex items-end gap-2">
            <span className="w-8 pb-2 text-right text-xs tabular-nums text-neutral-400">
              {formatChromaticPitch(lowestPitch)}
            </span>
            <div className="relative h-[68px] w-[432px]">
              {codes.map((code, index) => (
                <ComputerKey
                  key={code}
                  label={formatComputerKey(code)}
                  pitch={lowestPitch + index}
                  lowestPitch={lowestPitch}
                  isHeld={heldPitches.has(lowestPitch + index)}
                />
              ))}
              {rowIndex === 0 && (
                <div className="absolute bottom-0 left-[360px] flex items-center gap-1 text-xs text-neutral-400">
                  <span className={OCTAVE_KEY_CLASS}>[</span>
                  <span className={OCTAVE_KEY_CLASS}>]</span>
                  <span className="ml-1">Octave</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComputerKey({
  label,
  pitch,
  lowestPitch,
  isHeld,
}: {
  label: string;
  pitch: number;
  lowestPitch: number;
  isHeld: boolean;
}) {
  const isBlack = isBlackKey(pitch);
  const whiteKeysBelow = range(pitch - lowestPitch).filter(
    (i) => !isBlackKey(lowestPitch + i),
  ).length;
  return (
    <span
      style={{
        left: (whiteKeysBelow - (isBlack ? 0.5 : 0)) * COMPUTER_KEY_STEP,
      }}
      className={cn(
        "absolute flex size-8 items-center justify-center rounded text-xs font-medium",
        isBlack ? "top-0" : "bottom-0",
        isHeld
          ? isBlack
            ? "bg-emerald-600 text-neutral-100"
            : "bg-emerald-400 text-neutral-900"
          : isBlack
            ? "border border-neutral-600 bg-neutral-950 text-neutral-200"
            : "bg-neutral-100 text-neutral-900",
      )}
    >
      {label}
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

function isBlackKey(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.includes(pitch % 12);
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
