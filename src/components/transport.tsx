import { useMutation } from "@tanstack/react-query";
import {
  CircleHelpIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  TimerIcon,
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
      className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700"
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
        variant={isPlaying ? "default" : "ghost"}
        size="icon"
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <PauseIcon data-testid="pause-icon" className="size-4" />
        ) : (
          <PlayIcon data-testid="play-icon" className="size-4" />
        )}
      </Button>

      {/* Metronome toggle */}
      {/* TODO: better metronome icon */}
      <Button
        data-testid="metronome-toggle"
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        variant={metronomeEnabled ? "default" : "ghost"}
        size="icon"
        title="Toggle metronome"
        aria-pressed={metronomeEnabled}
      >
        <TimerIcon className="size-4" />
      </Button>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time display: Bar|Beat - MM:SS.frac */}
      <div
        data-testid="time-display"
        className="font-mono text-muted-foreground tabular-nums"
      >
        {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Tempo: BPM input + tap button + time signature */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">BPM:</span>
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
        <span className="text-muted-foreground px-1">-</span>
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
        {/* TODO: icon? */}
        <span className="text-muted-foreground">Grid:</span>
        <Select
          value={gridSnap}
          onValueChange={(v) => setGridSnap(v as GridSnap)}
        >
          <SelectTrigger
            data-testid="grid-snap-select"
            size="sm"
            className="w-20"
          >
            <SelectValue />
          </SelectTrigger>
          {/* TODO: layout odd? */}
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
            variant="ghost"
            size="icon"
            title="Settings"
          >
            <SettingsIcon className="size-4" />
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
                <span className="text-muted-foreground text-sm w-10">
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
        <CircleHelpIcon className="size-4" />
      </Button>
    </div>
  );
}
