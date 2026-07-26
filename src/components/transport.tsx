import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleHelpIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAudio } from "../hooks/use-audio";
import { useDraftInput } from "../hooks/use-draft-input";
import { useWindowEvent } from "../hooks/use-window-event";
import { audioManager } from "../lib/audio";
import { GM_PROGRAMS } from "../lib/general-midi";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { useProjectStore } from "../lib/project-store";
import { COMMON_TIME_SIGNATURES, type GridSnap } from "../types";
import { MetronomeIcon } from "./icons";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

function formatTimeCompact(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(hundredths).padStart(2, "0")}`;
}

function formatBarBeat(seconds: number, tempo: number): string {
  const beatsPerSecond = tempo / 60;
  const totalBeats = seconds * beatsPerSecond;
  const bar = Math.floor(totalBeats / 4) + 1; // 4/4 time signature
  const beatInBar = Math.floor(totalBeats % 4) + 1;
  return `${String(bar).padStart(2, "0")}|${String(beatInBar).padStart(2, "0")}`;
}

// Separate component to isolate position-based re-renders
function TimeDisplay({ tempo }: { tempo: number }) {
  const position = useAudio((state) => state.position);
  return (
    <div
      data-testid="time-display"
      className="font-mono text-muted-foreground tabular-nums"
    >
      {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
    </div>
  );
}

// Separate component to isolate isPlaying-based re-renders
function PlayPauseButton() {
  const isPlaying = useAudio((state) => state.isPlaying);
  const audioStatus = useAudio((state) => state.status);

  return (
    <Button
      data-testid="play-pause-button"
      disabled={audioStatus !== "ready"}
      onClick={() => audioManager.togglePlayback()}
      title={
        audioStatus !== "ready"
          ? "Loading audio..."
          : isPlaying
            ? "Pause (Space)"
            : "Play (Space)"
      }
      className={cn(
        "size-9",
        isPlaying
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
      )}
    >
      {isPlaying ? (
        <PauseIcon data-testid="pause-icon" className="size-5" />
      ) : (
        <PlayIcon data-testid="play-icon" className="size-5" />
      )}
    </Button>
  );
}

// GM instrument groups for organized display
const INSTRUMENT_GROUPS = [
  { label: "Piano", start: 0, end: 8 },
  { label: "Chromatic Percussion", start: 8, end: 16 },
  { label: "Organ", start: 16, end: 24 },
  { label: "Guitar", start: 24, end: 32 },
  { label: "Bass", start: 32, end: 40 },
  { label: "Strings", start: 40, end: 48 },
  { label: "Ensemble", start: 48, end: 56 },
  { label: "Brass", start: 56, end: 64 },
  { label: "Reed", start: 64, end: 72 },
  { label: "Pipe", start: 72, end: 80 },
  { label: "Synth Lead", start: 80, end: 88 },
  { label: "Synth Pad", start: 88, end: 96 },
  { label: "Synth Effects", start: 96, end: 104 },
  { label: "Ethnic", start: 104, end: 112 },
  { label: "Percussive", start: 112, end: 120 },
  { label: "Sound Effects", start: 120, end: 128 },
] as const;

function InstrumentCombobox({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid="instrument-select"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-44 justify-between gap-1.5 px-3 text-sm font-normal hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          <span className="truncate">
            {value}: {GM_PROGRAMS[value]}
          </span>
          <ChevronsUpDownIcon className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search instruments..." />
          <CommandList>
            <CommandEmpty>No instrument found.</CommandEmpty>
            {INSTRUMENT_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {GM_PROGRAMS.slice(group.start, group.end).map((name, i) => {
                  const program = group.start + i;
                  return (
                    <CommandItem
                      key={program}
                      value={`${program}: ${name}`}
                      onSelect={() => {
                        onValueChange(program);
                        setOpen(false);
                      }}
                      className="text-xs"
                    >
                      <CheckIcon
                        className={`mr-2 size-4 ${
                          value === program ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      {program}: {name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type TransportProps = {
  onSettingsClick: () => void;
  onHelpClick: () => void;
  onMixerClick: () => void;
  projectName: string;
};

export function Transport({
  onSettingsClick,
  onHelpClick,
  onMixerClick,
  projectName,
}: TransportProps) {
  const {
    tempo,
    timeSignature,
    midiProgram,
    midiMuted,
    audioTracks,
    metronomeEnabled,
    autoScrollEnabled,
    gridSnap,
    setTempo,
    setTimeSignature,
    setMidiProgram,
    setMidiMuted,
    updateAudioTrack,
    setMetronomeEnabled,
    setAutoScrollEnabled,
    setGridSnap,
  } = useProjectStore();

  const tapTimesRef = useRef<number[]>([]);

  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: setTempo,
    min: 30,
    max: 300,
  });

  // Keyboard shortcuts: M=metronome, F=auto-scroll, Shift+1/2=mute (Space is handled by PlayPauseButton)
  useWindowEvent("keydown", (e) => {
    if (isShortcutTextInputTarget(e.target)) {
      return;
    }
    if (matchKeyboardEvent(e, "M") && !e.repeat) {
      e.preventDefault();
      setMetronomeEnabled(!metronomeEnabled);
    }
    if (matchKeyboardEvent(e, "F") && !e.repeat) {
      e.preventDefault();
      setAutoScrollEnabled(!autoScrollEnabled);
    }
    // Shift+1 - Toggle MIDI mute
    if (matchKeyboardEvent(e, "Shift+1") && !e.repeat) {
      e.preventDefault();
      setMidiMuted(!midiMuted);
    }
    // Shift+2 - Toggle first audio track mute
    if (matchKeyboardEvent(e, "Shift+2") && !e.repeat) {
      e.preventDefault();
      const firstTrack = audioTracks[0];
      if (firstTrack) {
        updateAudioTrack(firstTrack.id, { muted: !firstTrack.muted });
      }
    }
  });

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    // Reset if last tap was more than 2 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    // Keep only last 8 taps
    if (taps.length > 8) {
      taps.shift();
    }

    // Need at least 2 taps to calculate BPM
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);

      // Clamp to valid range
      if (bpm >= 30 && bpm <= 300) {
        setTempo(bpm);
      }
    }
  };

  return (
    <div
      data-testid="transport"
      className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700"
    >
      {/* Play/Pause button */}
      <PlayPauseButton />

      {/* Metronome toggle */}
      <Button
        data-testid="metronome-mute-toggle"
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        aria-pressed={metronomeEnabled}
        title="Toggle metronome (M)"
        className={cn(
          "size-9",
          metronomeEnabled
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
      >
        <MetronomeIcon className="size-5" />
      </Button>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time display: Bar|Beat - MM:SS.frac */}
      <TimeDisplay tempo={tempo} />

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Tempo: BPM input + tap button + time signature */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">BPM:</span>
        <input
          data-testid="tempo-input"
          type="text"
          inputMode="numeric"
          {...tempoInput.props}
          className="w-14 h-8 px-1 text-sm font-mono bg-input border border-border rounded text-center text-foreground"
        />
        <Button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          title="Tap tempo"
          className="h-8 gap-1.5 px-1.5 text-xs hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          TAP
        </Button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time signature selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="time-signature-select"
            className="h-8 gap-1 px-3 font-mono hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
          >
            {timeSignature.numerator}/{timeSignature.denominator}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={`${timeSignature.numerator}/${timeSignature.denominator}`}
            onValueChange={(v) => {
              const [numerator, denominator] = v.split("/").map(Number);
              setTimeSignature({ numerator, denominator });
            }}
          >
            {COMMON_TIME_SIGNATURES.map((ts) => (
              <DropdownMenuRadioItem
                key={`${ts.numerator}/${ts.denominator}`}
                value={`${ts.numerator}/${ts.denominator}`}
              >
                {ts.numerator}/{ts.denominator}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Grid snap selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="grid-snap-select"
            className="h-8 gap-1 px-3 font-mono hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
          >
            {gridSnap}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={gridSnap}
            onValueChange={(v) => setGridSnap(v as GridSnap)}
          >
            <DropdownMenuRadioItem value="1/4">1/4</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/8">1/8</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/16">1/16</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/4T">1/4T</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/8T">1/8T</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/16T">1/16T</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Instrument selector */}
      <InstrumentCombobox value={midiProgram} onValueChange={setMidiProgram} />

      {/* Spacer */}
      <div className="flex-1" />

      <div
        data-testid="project-name-header"
        title={projectName}
        className="text-sm text-neutral-300 truncate max-w-[220px]"
      >
        {projectName}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Settings button */}
      <Button
        data-testid="settings-button"
        onClick={onSettingsClick}
        title="Settings"
        className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
      >
        <SettingsIcon className="size-5" />
      </Button>

      {/* Mixer button */}
      <Button
        data-testid="mixer-button"
        onClick={onMixerClick}
        title="Mixer"
        className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
      >
        <SlidersHorizontalIcon className="size-5" />
      </Button>

      {/* Help button */}
      <Button
        data-testid="help-button"
        onClick={onHelpClick}
        title="Show keyboard shortcuts (?)"
        className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
      >
        <CircleHelpIcon className="size-5" />
      </Button>
    </div>
  );
}
