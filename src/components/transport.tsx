import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleHelpIcon,
  FolderIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  Volume2Icon,
} from "lucide-react";
import { ArrowLeftRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import * as Tone from "tone";
import { useDraftInput } from "../hooks/use-draft-input";
import { useTransport } from "../hooks/use-transport";
import { useWindowEvent } from "../hooks/use-window-event";
import { audioManager, GM_PROGRAMS } from "../lib/audio";
import { useProjectStore } from "../stores/project-store";
import { COMMON_TIME_SIGNATURES, type GridSnap } from "../types";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Slider } from "./ui/slider";

function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      aria-label="Metronome"
    >
      <title>Metronome</title>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m14.153 8.188l-.72-3.236a2.493 2.493 0 0 0-4.867 0L5.541 18.566A2 2 0 0 0 7.493 21h7.014a2 2 0 0 0 1.952-2.434l-.524-2.357M11 18l9-13m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
      />
    </svg>
  );
}

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
  const { position } = useTransport();
  return (
    <div
      data-testid="time-display"
      className="font-mono text-muted-foreground tabular-nums"
    >
      {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
    </div>
  );
}

function togglePlayback() {
  if (Tone.getTransport().state === "started") {
    audioManager.pause();
  } else {
    audioManager.play();
  }
}

// Separate component to isolate isPlaying-based re-renders
function PlayPauseButton() {
  const { isPlaying } = useTransport();

  // Space key shortcut
  useWindowEvent("keydown", (e) => {
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      togglePlayback();
    }
  });

  return (
    <Button
      data-testid="play-pause-button"
      onClick={togglePlayback}
      variant={isPlaying ? "default" : "ghost"}
      size="icon"
      title={isPlaying ? "Pause (Space)" : "Play (Space)"}
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
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-44 justify-between font-normal"
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
  onProjectSettingsClick: () => void;
  onHelpClick: () => void;
  onProjectsClick: () => void;
  onImportExportClick: () => void;
};

export function Transport({
  onProjectSettingsClick,
  onHelpClick,
  onProjectsClick,
  onImportExportClick,
}: TransportProps) {
  const {
    tempo,
    timeSignature,
    midiVolume,
    midiProgram,
    audioVolume,
    metronomeVolume,
    metronomeEnabled,
    autoScrollEnabled,
    gridSnap,
    showDebug,
    setTempo,
    setTimeSignature,
    setMidiVolume,
    setMidiProgram,
    setAudioVolume,
    setMetronomeVolume,
    setMetronomeEnabled,
    setAutoScrollEnabled,
    setGridSnap,
    setShowDebug,
  } = useProjectStore();

  const tapTimesRef = useRef<number[]>([]);

  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: setTempo,
    min: 30,
    max: 300,
  });

  // Keyboard shortcut: Ctrl+F=auto-scroll (Space is handled by PlayPauseButton)
  useWindowEvent("keydown", (e) => {
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.repeat) {
      e.preventDefault();
      setAutoScrollEnabled(!autoScrollEnabled);
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
        data-testid="metronome-toggle"
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        variant={metronomeEnabled ? "default" : "ghost"}
        size="icon"
        title="Toggle metronome"
        aria-pressed={metronomeEnabled}
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
          variant="ghost"
          size="sm"
          title="Tap tempo"
          className="text-xs px-1.5"
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
            variant="ghost"
            size="sm"
            className="gap-1 font-mono"
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
            variant="ghost"
            size="sm"
            className="gap-1 font-mono"
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

      {/* Settings dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="settings-button"
            variant="ghost"
            size="icon"
            title="Settings"
          >
            <SettingsIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Project Settings */}
          <DropdownMenuItem
            data-testid="project-settings-button"
            onClick={onProjectSettingsClick}
          >
            <SettingsIcon className="size-4" />
            Project Settings
          </DropdownMenuItem>

          {/* Projects */}
          <DropdownMenuItem
            data-testid="projects-button"
            onClick={onProjectsClick}
          >
            <FolderIcon className="size-4" />
            Projects
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Import/Export */}
          <DropdownMenuItem
            data-testid="import-export-button"
            onClick={onImportExportClick}
          >
            <ArrowLeftRightIcon className="size-4" />
            Import / Export...
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Volume sliders */}
          <div className="px-2 py-1.5 flex items-center gap-2">
            <MusicIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">MIDI</span>
            <Slider
              value={[midiVolume * 100]}
              onValueChange={([v]) => setMidiVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>
          <div className="px-2 py-1.5 flex items-center gap-2">
            <Volume2Icon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">Audio</span>
            <Slider
              value={[audioVolume * 100]}
              onValueChange={([v]) => setAudioVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>
          <div className="px-2 py-1.5 flex items-center gap-2">
            <MetronomeIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">Metro</span>
            <Slider
              value={[metronomeVolume * 100]}
              onValueChange={([v]) => setMetronomeVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>

          <DropdownMenuSeparator />

          {/* Auto-scroll toggle */}
          <DropdownMenuCheckboxItem
            data-testid="auto-scroll-toggle"
            checked={autoScrollEnabled}
            onCheckedChange={setAutoScrollEnabled}
            onSelect={(e) => e.preventDefault()}
            aria-pressed={autoScrollEnabled}
          >
            Auto-scroll
            <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>

          {/* Debug toggle */}
          <DropdownMenuCheckboxItem
            data-testid="debug-toggle"
            checked={showDebug}
            onCheckedChange={setShowDebug}
            onSelect={(e) => e.preventDefault()}
          >
            Debug
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help button */}
      <Button
        data-testid="help-button"
        onClick={onHelpClick}
        variant="ghost"
        size="icon"
        title="Show keyboard shortcuts (?)"
      >
        <CircleHelpIcon className="size-5" />
      </Button>
    </div>
  );
}
