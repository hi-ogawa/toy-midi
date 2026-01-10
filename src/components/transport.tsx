import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { saveAsset } from "../lib/asset-store";
import { audioManager } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { useProjectStore } from "../stores/project-store";
import { GridSnap } from "../types";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type TransportProps = {
  onHelpClick: () => void;
};

export function Transport({ onHelpClick }: TransportProps) {
  const {
    audioFileName,
    audioDuration,
    isPlaying,
    playheadPosition,
    tempo,
    notes,
    audioVolume,
    midiVolume,
    metronomeEnabled,
    gridSnap,
    showDebug,
    setAudioFile,
    setIsPlaying,
    setPlayheadPosition,
    setTempo,
    setAudioVolume,
    setMidiVolume,
    setMetronomeEnabled,
    setGridSnap,
    setShowDebug,
    setAudioPeaks,
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Position tracking loop
  const updatePosition = useCallback(() => {
    if (audioManager.isPlaying) {
      setPlayheadPosition(audioManager.position);
      rafRef.current = requestAnimationFrame(updatePosition);
    }
  }, [setPlayheadPosition]);

  // Start/stop position tracking when play state changes
  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updatePosition);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, updatePosition]);

  const loadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const duration = await audioManager.loadAudio(file);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);

      setAudioFile(file.name, duration, assetKey);
      setPlayheadPosition(0);

      // Extract peaks for waveform display
      const peaksPerSecond = 100;
      const peaks = audioManager.getPeaks(peaksPerSecond);
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

  // Note: audioManager.init() is called in App.tsx on startup screen click
  // Volume sync is also handled there after project restore

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioManager.pause();
      audioManager.clearScheduledNotes();
      setIsPlaying(false);
    } else {
      // Schedule MIDI notes from current position
      audioManager.scheduleNotes(notes, audioManager.position, tempo);
      audioManager.play();
      setIsPlaying(true);
    }
  }, [isPlaying, setIsPlaying, notes, tempo]);

  // Space key to toggle play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // Don't trigger if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause]);

  // Use audioDuration > 0 as proxy for loaded state (reactive)
  const audioLoaded = audioDuration > 0;

  const handleAudioVolumeChange = (value: number) => {
    setAudioVolume(value);
    audioManager.setAudioVolume(value);
  };

  const handleMidiVolumeChange = (value: number) => {
    setMidiVolume(value);
    audioManager.setMidiVolume(value);
  };

  const handleMetronomeToggle = () => {
    const newValue = !metronomeEnabled;
    setMetronomeEnabled(newValue);
    audioManager.setMetronomeEnabled(newValue);
  };

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
      className="flex items-center gap-3 px-4 py-2 bg-neutral-800 border-b border-neutral-700"
    >
      {/* Load button */}
      <button
        data-testid="load-audio-button"
        onClick={handleLoadClick}
        disabled={loadAudioMutation.isPending}
        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 rounded disabled:opacity-50"
      >
        {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
      </button>
      <input
        data-testid="audio-file-input"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Export MIDI button */}
      <button
        data-testid="export-midi-button"
        onClick={handleExportMidi}
        disabled={notes.length === 0}
        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 rounded disabled:opacity-50"
        title="Export MIDI file"
      >
        Export MIDI
      </button>

      {/* Play/Pause button - always enabled for MIDI-only mode */}
      <button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        className="w-10 h-10 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded"
      >
        {isPlaying ? (
          <span className="text-lg">⏸</span>
        ) : (
          <span className="text-lg">▶</span>
        )}
      </button>

      {/* Time display */}
      <div
        data-testid="time-display"
        className="font-mono text-sm text-neutral-300 min-w-[100px]"
      >
        {formatTime(playheadPosition)} / {formatTime(audioDuration)}
      </div>

      {/* Tempo input */}
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
              // Accept any value during typing, clamp on blur
              setTempo(value);
            }
          }}
          onBlur={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
              setTempo(Math.min(300, Math.max(30, value)));
            }
          }}
          className="w-14 px-1 py-0.5 text-sm font-mono bg-neutral-700 border border-neutral-600 rounded text-center"
        />
        <span className="text-xs text-neutral-400">BPM</span>
        <button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          className="px-2 py-0.5 text-xs bg-neutral-700 hover:bg-neutral-600 rounded"
          title="Tap to set tempo"
        >
          Tap
        </button>
      </div>

      {/* Grid snap selector */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-400">Grid:</span>
        <select
          data-testid="grid-snap-select"
          value={gridSnap}
          onChange={(e) => setGridSnap(e.target.value as GridSnap)}
          className="bg-neutral-700 border border-neutral-600 rounded px-1.5 py-0.5 text-xs"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/4T">1/4T</option>
          <option value="1/8T">1/8T</option>
          <option value="1/16T">1/16T</option>
        </select>
      </div>

      {/* File name */}
      {audioFileName && (
        <span
          data-testid="audio-file-name"
          className="text-sm text-neutral-400 truncate max-w-[200px]"
        >
          {audioFileName}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mixer controls */}
      <div className="flex items-center gap-3">
        {/* Audio volume */}
        {audioLoaded && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500">Audio</span>
            <input
              type="range"
              min={0}
              max={100}
              value={audioVolume * 100}
              onChange={(e) =>
                handleAudioVolumeChange(parseInt(e.target.value, 10) / 100)
              }
              className="w-16 h-1 accent-neutral-400"
            />
          </div>
        )}

        {/* MIDI volume */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">MIDI</span>
          <input
            type="range"
            min={0}
            max={100}
            value={midiVolume * 100}
            onChange={(e) =>
              handleMidiVolumeChange(parseInt(e.target.value, 10) / 100)
            }
            className="w-16 h-1 accent-neutral-400"
          />
        </div>

        {/* Metronome toggle */}
        <button
          data-testid="metronome-toggle"
          onClick={handleMetronomeToggle}
          aria-pressed={metronomeEnabled}
          className={`px-2 py-1 text-xs rounded ${
            metronomeEnabled
              ? "bg-emerald-600 text-white"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
          }`}
          title="Toggle metronome"
        >
          Metro
        </button>

        {/* Debug toggle */}
        <button
          data-testid="debug-toggle"
          onClick={() => setShowDebug(!showDebug)}
          className={`w-6 h-6 flex items-center justify-center rounded ${
            showDebug
              ? "bg-yellow-600 text-white"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200"
          }`}
          title="Toggle debug overlay"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M6.56 1.14a.75.75 0 01.177 1.045 3.989 3.989 0 00-.464.86c.185.17.382.329.59.473A3.993 3.993 0 0110 2c1.272 0 2.405.594 3.137 1.518.208-.144.405-.302.59-.473a3.989 3.989 0 00-.464-.86.75.75 0 011.222-.869c.369.519.65 1.105.822 1.736a.75.75 0 01-.174.707 5.23 5.23 0 01-1.795 1.283A4.003 4.003 0 0114 7.5h1.5a.75.75 0 010 1.5H14v1.25c0 .307-.025.608-.072.903l1.903.65a.75.75 0 01-.486 1.42l-1.638-.558a4.004 4.004 0 01-.946 1.167l1.236 2.139a.75.75 0 01-1.299.75l-1.177-2.04a4 4 0 01-3.042 0l-1.177 2.04a.75.75 0 11-1.299-.75l1.236-2.139a4.004 4.004 0 01-.946-1.167l-1.638.558a.75.75 0 01-.486-1.42l1.903-.65A4.03 4.03 0 016 10.25V9H4.5a.75.75 0 010-1.5H6A4.003 4.003 0 016.662 5.04 5.23 5.23 0 014.867 3.756a.75.75 0 01-.174-.707c.172-.63.453-1.217.822-1.736a.75.75 0 011.045-.177zM7.5 7.5c0 .232.03.457.086.672.055.215.136.42.24.611h4.348c.104-.191.185-.396.24-.611A2.5 2.5 0 007.5 7.5zm.086 2.783a2.5 2.5 0 004.828 0h-4.828z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Help button */}
        <button
          data-testid="help-button"
          onClick={onHelpClick}
          className="w-6 h-6 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-400 hover:text-neutral-200 text-sm font-bold"
          title="Show keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </div>
  );
}
