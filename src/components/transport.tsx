import { useMutation } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleHelpIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  UploadIcon,
  Volume2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { ToneAudioBuffer } from "tone";
import { useTransport } from "../hooks/use-transport";
import { saveAsset } from "../lib/asset-store";
import { audioManager, getAudioBufferPeaks } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { useProjectStore } from "../stores/project-store";
import { GridSnap } from "../types";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Toggle } from "./ui/toggle";

function formatTimeCompact(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatBarBeat(seconds: number, tempo: number): string {
  const beatsPerSecond = tempo / 60;
  const totalBeats = seconds * beatsPerSecond;
  const bar = Math.floor(totalBeats / 4) + 1; // 4/4 time signature
  const beatInBar = (totalBeats % 4) + 1;
  return `${bar}|${beatInBar.toFixed(2)}`;
}

// Metronome icon (not in lucide)
function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1.5a1 1 0 011 1v2.09a1 1 0 01-.553.894l-.447.224V8h1a1 1 0 110 2h-1v9.382l3.553-7.106a1 1 0 011.788.894l-4.5 9a1 1 0 01-1.788-.894L12 18.618V10h-1a1 1 0 110-2h1V5.618l-.447-.224A1 1 0 0111 4.5V2.5a1 1 0 011-1z" />
      <path d="M7 22a2 2 0 01-2-2V8.472l3.528-5.293a2 2 0 013.472 2L9 10v10a2 2 0 01-2 2zM17 22a2 2 0 002-2V10l-2.528-4.82a2 2 0 00-3.472 2L16 8.472V20a2 2 0 002 2z" />
    </svg>
  );
}

type TransportProps = {
  onHelpClick: () => void;
};

export function Transport({ onHelpClick }: TransportProps) {
  const {
    audioFileName,
    audioDuration,
    tempo,
    notes,
    audioVolume,
    metronomeEnabled,
    autoScrollEnabled,
    gridSnap,
    showDebug,
    setAudioFile,
    setTempo,
    setAudioVolume,
    setMetronomeEnabled,
    setAutoScrollEnabled,
    setGridSnap,
    setShowDebug,
    setAudioPeaks,
    setAudioOffset,
  } = useProjectStore();

  // Transport state from hook (source of truth: Tone.js Transport)
  const { isPlaying, position } = useTransport();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  const loadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      // TODO: refactor with initial project restore in app.tsx
      const url = URL.createObjectURL(file);
      const buffer = await ToneAudioBuffer.fromUrl(url);
      URL.revokeObjectURL(url);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);
      setAudioFile(file.name, buffer.duration, assetKey);

      audioManager.player.buffer = buffer;
      audioManager.player.sync().start(0);
      setAudioOffset(0);

      // Extract peaks for waveform display
      const peaksPerSecond = 100;
      const peaks = getAudioBufferPeaks(buffer, peaksPerSecond);
      setAudioPeaks(peaks, peaksPerSecond);
    },
  });

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAudioMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioManager.pause();
    } else {
      audioManager.play();
    }
  }, [isPlaying]);

  const handleAutoScrollToggle = useCallback(() => {
    setAutoScrollEnabled(!autoScrollEnabled);
  }, [autoScrollEnabled, setAutoScrollEnabled]);

  // Keyboard shortcuts: Space=play/pause, Ctrl+F=auto-scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (
        (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        handleAutoScrollToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleAutoScrollToggle]);

  // Use audioDuration > 0 as proxy for loaded state (reactive)
  const audioLoaded = audioDuration > 0;

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

  const handleExportMidi = () => {
    const midiData = exportMidi({
      notes,
      tempo,
      trackName: audioFileName
        ? audioFileName.replace(/\.[^.]+$/, "")
        : "Piano Roll",
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, "-")
      .replace(/\.\d+Z$/, "");
    const fileName = `toy-midi-export-${timestamp}.mid`;

    downloadMidiFile(midiData, fileName);
  };

  return (
    <div
      data-testid="transport"
      className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 text-xs"
    >
      {/* Hidden file input */}
      <input
        data-testid="audio-file-input"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Play/Pause button */}
      <Button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        variant={isPlaying ? "default" : "secondary"}
        size="icon-sm"
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <PauseIcon data-testid="pause-icon" className="size-4" />
        ) : (
          <PlayIcon data-testid="play-icon" className="size-4" />
        )}
      </Button>

      {/* Metronome toggle */}
      <Toggle
        data-testid="metronome-toggle"
        pressed={metronomeEnabled}
        onPressedChange={setMetronomeEnabled}
        size="sm"
        title="Toggle metronome"
        aria-pressed={metronomeEnabled}
      >
        <MetronomeIcon className="size-4" />
      </Toggle>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time display: Bar|Beat.frac - MM:SS.frac */}
      <div
        data-testid="time-display"
        className="font-mono text-muted-foreground tabular-nums min-w-[140px]"
      >
        {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Tempo: BPM input + tap button + time signature */}
      <div className="flex items-center gap-1">
        <input
          data-testid="tempo-input"
          type="number"
          min={30}
          max={300}
          value={tempo}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
              setTempo(value);
            }
          }}
          onBlur={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
              setTempo(Math.min(300, Math.max(30, value)));
            }
          }}
          className="w-10 h-6 px-1 font-mono bg-input border border-border rounded text-center text-foreground text-xs"
        />
        <Button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          variant="ghost"
          size="icon-sm"
          className="size-6"
          title="Tap tempo"
        >
          <span className="text-xs font-medium">TAP</span>
        </Button>
        <span className="text-muted-foreground">-</span>
        <span
          className="text-muted-foreground tabular-nums"
          title="Time signature"
        >
          4/4
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Grid snap selector */}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Grid:</span>
        <Select
          value={gridSnap}
          onValueChange={(v) => setGridSnap(v as GridSnap)}
        >
          <SelectTrigger
            data-testid="grid-snap-select"
            size="sm"
            className="h-6 w-16 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1/4">1/4</SelectItem>
            <SelectItem value="1/8">1/8</SelectItem>
            <SelectItem value="1/16">1/16</SelectItem>
            <SelectItem value="1/4T">1/4T</SelectItem>
            <SelectItem value="1/8T">1/8T</SelectItem>
            <SelectItem value="1/16T">1/16T</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="settings-button"
            variant="secondary"
            size="sm"
            className="h-6 gap-1"
          >
            <SettingsIcon className="size-3" />
            <span>Settings</span>
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Load Audio */}
          <DropdownMenuItem
            data-testid="load-audio-button"
            onClick={handleLoadClick}
            disabled={loadAudioMutation.isPending}
          >
            <UploadIcon className="size-4" />
            {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
          </DropdownMenuItem>

          {/* Export MIDI */}
          <DropdownMenuItem
            data-testid="export-midi-button"
            onClick={handleExportMidi}
            disabled={notes.length === 0}
          >
            <DownloadIcon className="size-4" />
            Export MIDI
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Audio volume (only if audio loaded) */}
          {audioLoaded && (
            <>
              <div className="px-2 py-1.5 flex items-center gap-2">
                <Volume2Icon className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground text-xs w-10">
                  Audio
                </span>
                <Slider
                  value={[audioVolume * 100]}
                  onValueChange={([v]) => setAudioVolume(v / 100)}
                  max={100}
                  step={1}
                  className="flex-1"
                />
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Auto-scroll toggle */}
          <DropdownMenuCheckboxItem
            data-testid="auto-scroll-toggle"
            checked={autoScrollEnabled}
            onCheckedChange={setAutoScrollEnabled}
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
        size="icon-sm"
        className="size-6"
        title="Show keyboard shortcuts (?)"
      >
        <CircleHelpIcon className="size-4" />
      </Button>
    </div>
  );
}
