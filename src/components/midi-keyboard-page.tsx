import { useQuery } from "@tanstack/react-query";
import {
  CircleHelpIcon,
  HouseIcon,
  KeyboardMusicIcon,
  MinusIcon,
  MoreVerticalIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LIVE_CONTROLLER_SETTINGS, PITCH_WHEEL_MAX } from "../lib/general-midi";
import {
  encodeMidiMessage,
  requestMidiAccess,
  subscribeMidiOutputs,
} from "../lib/midi-device";
import { MAX_OCTAVE, MIN_OCTAVE } from "../lib/midi-keyboard";
import { routes } from "../lib/routes";
import {
  ComputerKeyboardLayout,
  MidiKeyboardPiano,
} from "./midi-keyboard-keys";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Slider } from "./ui/slider";
import { useMidiKeyboard } from "./use-midi-keyboard";

const DEMO_TRACK_HREF = `${routes.draft.href()}?src=/midi-keyboard-demo.json`;

export function MidiKeyboardPage() {
  useEffect(() => {
    document.title = "MIDI Keyboard - Toy MIDI";
  }, []);

  return (
    <main className="h-screen overflow-y-auto bg-neutral-900 text-neutral-100">
      <header className="sticky top-0 z-10 flex h-[53px] items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 text-neutral-100 shadow-sm">
        <KeyboardMusicIcon className="size-5 text-emerald-400" />
        <span className="font-medium">MIDI Keyboard</span>
        <div className="flex-1" />
        <MidiKeyboardHelp />
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
        <MidiKeyboardControls />
      </div>
    </main>
  );
}

function MidiKeyboardHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          title="MIDI keyboard help"
          aria-label="MIDI keyboard help"
          className="size-9 hover:bg-accent hover:text-accent-foreground"
        >
          <CircleHelpIcon className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3 text-xs">
        <p>A virtual MIDI controller. It makes no sound by itself.</p>
        <p>
          To hear it, send it to anything that takes MIDI input. To reach
          another app on this computer, use a loopback port, such as the IAC
          Driver on macOS.
        </p>
        <p>
          To hear it in the editor, open a{" "}
          <a
            href={DEMO_TRACK_HREF}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            demo track
          </a>
          , select the same port under MIDI Device, and turn on Monitor.
        </p>
      </PopoverContent>
    </Popover>
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
    send: (message) => output?.send(encodeMidiMessage(message)),
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <label
          htmlFor="midi-output"
          className="text-xs font-semibold text-neutral-400"
        >
          MIDI output
        </label>
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

      <MidiKeyboardPiano
        keyboard={keyboard}
        heldPitches={heldPitches}
        className="h-40"
      />
      <ComputerKeyboardLayout octave={octave} heldPitches={heldPitches} />
    </div>
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
