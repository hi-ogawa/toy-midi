import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToneAudioBuffer } from "tone";
import { useTransport } from "../hooks/use-transport";
import { saveAsset } from "../lib/asset-store";
import { audioManager, getAudioBufferPeaks } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { useProjectStore } from "../stores/project-store";
import { GridSnap } from "../types";

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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [settingsOpen]);

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

  // Note: audioManager.init() is called in App.tsx on startup screen click
  // Volume sync is handled by reactive effects above

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

  const handleAudioVolumeChange = (value: number) => {
    setAudioVolume(value);
  };

  const handleMetronomeToggle = () => {
    setMetronomeEnabled(!metronomeEnabled);
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
      <button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        className={`w-8 h-8 flex items-center justify-center rounded ${
          isPlaying
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"
        }`}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <svg
            data-testid="pause-icon"
            className="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg
            data-testid="play-icon"
            className="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Metronome toggle */}
      <button
        data-testid="metronome-toggle"
        onClick={handleMetronomeToggle}
        aria-pressed={metronomeEnabled}
        className={`w-8 h-8 flex items-center justify-center rounded ${
          metronomeEnabled
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
        }`}
        title="Toggle metronome"
      >
        {/* Metronome icon */}
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 1.5a1 1 0 011 1v2.09a1 1 0 01-.553.894l-.447.224V8h1a1 1 0 110 2h-1v9.382l3.553-7.106a1 1 0 011.788.894l-4.5 9a1 1 0 01-1.788-.894L12 18.618V10h-1a1 1 0 110-2h1V5.618l-.447-.224A1 1 0 0111 4.5V2.5a1 1 0 011-1z" />
          <path d="M7 22a2 2 0 01-2-2V8.472l3.528-5.293a2 2 0 013.472 2L9 10v10a2 2 0 01-2 2zM17 22a2 2 0 002-2V10l-2.528-4.82a2 2 0 00-3.472 2L16 8.472V20a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Time display: Bar|Beat.frac - MM:SS.frac */}
      <div
        data-testid="time-display"
        className="font-mono text-neutral-300 tabular-nums min-w-[140px]"
      >
        {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Tempo: BPM input + tap icon + time signature */}
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
          className="w-10 h-6 px-1 font-mono bg-neutral-700 border border-neutral-600 rounded text-center text-neutral-200"
        />
        <button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          className="w-6 h-6 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-400 hover:text-neutral-200"
          title="Tap tempo"
        >
          {/* Hand/tap icon */}
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 3.5a.5.5 0 00-1 0V9H6.5a.5.5 0 000 1H9v2.5a.5.5 0 001 0V10h2.5a.5.5 0 000-1H10V3.5z" />
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-1a7 7 0 100-14 7 7 0 000 14z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <span className="text-neutral-500">-</span>
        <span className="text-neutral-400 tabular-nums" title="Time signature">
          4/4
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-600" />

      {/* Grid snap selector */}
      <div className="flex items-center gap-1">
        <span className="text-neutral-500">Grid:</span>
        <select
          data-testid="grid-snap-select"
          value={gridSnap}
          onChange={(e) => setGridSnap(e.target.value as GridSnap)}
          className="h-6 px-1 text-neutral-200 bg-neutral-700 border border-neutral-600 rounded"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/4T">1/4T</option>
          <option value="1/8T">1/8T</option>
          <option value="1/16T">1/16T</option>
        </select>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings dropdown */}
      <div ref={settingsRef} className="relative">
        <button
          data-testid="settings-button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`h-6 px-2 flex items-center gap-1 rounded ${
            settingsOpen
              ? "bg-neutral-600 text-neutral-100"
              : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
          }`}
        >
          <span>Settings</span>
          <svg
            className={`w-3 h-3 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {settingsOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-neutral-800 border border-neutral-600 rounded shadow-lg z-50">
            {/* Load Audio */}
            <button
              data-testid="load-audio-button"
              onClick={() => {
                handleLoadClick();
                setSettingsOpen(false);
              }}
              disabled={loadAudioMutation.isPending}
              className="w-full px-3 py-2 text-left text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
            </button>

            {/* Export MIDI */}
            <button
              data-testid="export-midi-button"
              onClick={() => {
                handleExportMidi();
                setSettingsOpen(false);
              }}
              disabled={notes.length === 0}
              className="w-full px-3 py-2 text-left text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export MIDI
            </button>

            {/* Divider */}
            <div className="border-t border-neutral-600 my-1" />

            {/* Audio volume (only if audio loaded) */}
            {audioLoaded && (
              <div className="px-3 py-2 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-neutral-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
                  <path d="M14.657 5.343a1 1 0 011.414 0A7.969 7.969 0 0118 10a7.969 7.969 0 01-1.929 4.657 1 1 0 01-1.414-1.414A5.981 5.981 0 0016 10a5.981 5.981 0 00-1.343-3.243 1 1 0 010-1.414z" />
                </svg>
                <span className="text-neutral-400 text-xs w-10">Audio</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioVolume * 100}
                  onChange={(e) =>
                    handleAudioVolumeChange(parseInt(e.target.value, 10) / 100)
                  }
                  className="flex-1 h-1 accent-neutral-400"
                />
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-neutral-600 my-1" />

            {/* Auto-scroll toggle */}
            <button
              data-testid="auto-scroll-toggle"
              onClick={handleAutoScrollToggle}
              aria-pressed={autoScrollEnabled}
              className="w-full px-3 py-2 text-left text-neutral-200 hover:bg-neutral-700 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
                <span>Auto-scroll</span>
                <span className="text-neutral-500 text-xs">Ctrl+F</span>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${autoScrollEnabled ? "bg-emerald-500" : "bg-neutral-600"}`}
              />
            </button>

            {/* Debug toggle */}
            <button
              data-testid="debug-toggle"
              onClick={() => setShowDebug(!showDebug)}
              className="w-full px-3 py-2 text-left text-neutral-200 hover:bg-neutral-700 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.56 1.14a.75.75 0 01.177 1.045 3.989 3.989 0 00-.464.86c.185.17.382.329.59.473A3.993 3.993 0 0110 2c1.272 0 2.405.594 3.137 1.518.208-.144.405-.302.59-.473a3.989 3.989 0 00-.464-.86.75.75 0 011.222-.869c.369.519.65 1.105.822 1.736a.75.75 0 01-.174.707 5.23 5.23 0 01-1.795 1.283A4.003 4.003 0 0114 7.5h1.5a.75.75 0 010 1.5H14v1.25c0 .307-.025.608-.072.903l1.903.65a.75.75 0 01-.486 1.42l-1.638-.558a4.004 4.004 0 01-.946 1.167l1.236 2.139a.75.75 0 01-1.299.75l-1.177-2.04a4 4 0 01-3.042 0l-1.177 2.04a.75.75 0 11-1.299-.75l1.236-2.139a4.004 4.004 0 01-.946-1.167l-1.638.558a.75.75 0 01-.486-1.42l1.903-.65A4.03 4.03 0 016 10.25V9H4.5a.75.75 0 010-1.5H6A4.003 4.003 0 016.662 5.04 5.23 5.23 0 014.867 3.756a.75.75 0 01-.174-.707c.172-.63.453-1.217.822-1.736a.75.75 0 011.045-.177zM7.5 7.5c0 .232.03.457.086.672.055.215.136.42.24.611h4.348c.104-.191.185-.396.24-.611A2.5 2.5 0 007.5 7.5zm.086 2.783a2.5 2.5 0 004.828 0h-4.828z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Debug</span>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${showDebug ? "bg-yellow-500" : "bg-neutral-600"}`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Help button */}
      <button
        data-testid="help-button"
        onClick={onHelpClick}
        className="w-6 h-6 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-400 hover:text-neutral-200 font-bold"
        title="Show keyboard shortcuts (?)"
      >
        ?
      </button>
    </div>
  );
}
