import { ChevronDownIcon, PauseIcon, PlayIcon } from "lucide-react";
import { type ReactNode } from "react";
import { useAudio } from "../hooks/use-audio";
import { useDraftInput } from "../hooks/use-draft-input";
import { useTapTempo } from "../hooks/use-tap-tempo";
import { useWindowEvent } from "../hooks/use-window-event";
import { audioManager } from "../lib/audio";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { projectStorage } from "../lib/project-storage";
import { useProjectStore } from "../lib/project-store";
import { formatTimeCompact } from "../lib/time-format";
import {
  formatBarBeat as formatBarBeatPosition,
  secondsToBeats,
} from "../lib/timeline";
import {
  COMMON_TIME_SIGNATURES,
  type GridSnap,
  parseTimeSignature,
} from "../types";
import { MetronomeIcon } from "./icons";
import { InstrumentCombobox } from "./instrument-combobox";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";

type TransportProps = {
  projectName: string;
  controls: ReactNode;
};

export function Transport({ projectName, controls }: TransportProps) {
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

  const handleMidiProgramChange = (program: number) => {
    setMidiProgram(program);
    projectStorage.updatePreferences({ defaultMidiProgram: program });
  };

  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: setTempo,
    min: 30,
    max: 300,
  });
  const handleTapTempo = useTapTempo({
    min: 30,
    max: 300,
    onTempoChange: setTempo,
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

  return (
    <div
      data-testid="transport"
      className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm"
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
        <span className="text-muted-foreground">BPM</span>
        <input
          data-testid="tempo-input"
          type="text"
          inputMode="numeric"
          {...tempoInput.props}
          className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
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
            className="h-8 gap-1.5 border-neutral-600 bg-neutral-900 px-3 font-mono text-neutral-100 hover:border-neutral-500 hover:bg-neutral-900"
          >
            {timeSignature.numerator}/{timeSignature.denominator}
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={`${timeSignature.numerator}/${timeSignature.denominator}`}
            onValueChange={(v) => {
              setTimeSignature(parseTimeSignature(v));
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
            className="h-8 gap-1.5 border-neutral-600 bg-neutral-900 px-3 font-mono text-neutral-100 hover:border-neutral-500 hover:bg-neutral-900"
          >
            {gridSnap}
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
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
      <InstrumentCombobox
        value={midiProgram}
        onValueChange={handleMidiProgramChange}
      />

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

      {controls}
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

function formatBarBeat(seconds: number, tempo: number): string {
  const totalBeats = secondsToBeats(seconds, tempo);
  const bar = Math.floor(totalBeats / 4) + 1; // 4/4 time signature
  const beatInBar = Math.floor(totalBeats % 4) + 1;
  return formatBarBeatPosition(bar, beatInBar);
}
