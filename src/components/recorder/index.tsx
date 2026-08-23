import { useMutation } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleIcon,
  CircleHelpIcon,
  CircleStopIcon,
  HouseIcon,
  LoaderCircleIcon,
  Mic2Icon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { useTapTempo } from "../../hooks/use-tap-tempo";
import { useWindowEvent } from "../../hooks/use-window-event";
import { resolveAudioFiles } from "../../lib/audio-files";
import { AudioView } from "../../lib/audio-view";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import {
  dbToPercent,
  formatGainDb,
  gainToPercent,
  percentToGain,
} from "../../lib/music";
import {
  getCaptureInputs,
  requestCaptureAccess,
} from "../../lib/recorder/capture-input";
import {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { recorderStorage } from "../../lib/recorder/storage";
import { routes } from "../../lib/routes";
import { formatTimeWithMilliseconds } from "../../lib/time-format";
import {
  beatsToSeconds,
  DEFAULT_GRID_DIVISION,
  DEFAULT_PIXELS_PER_BEAT,
  formatBarBeatAtTime,
  getBeatsPerBar,
  getSubdivisionsPerBeat,
  getVisibleBarInterval,
  GRID_DIVISIONS,
  type GridDivision,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
  secondsToBeats,
} from "../../lib/timeline";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import {
  COMMON_TIME_SIGNATURES,
  parseTimeSignature,
  type TimeSignature,
} from "../../types";
import { AudioWaveformView } from "../audio-waveform";
import { openFilePicker } from "../file-drop-input";
import { MetronomeIcon } from "../icons";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";

export function Recorder() {
  const [runtime] = useState(() => new RecorderRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const input = useRecorderInput({
    runtime,
    state,
  });
  const timeline = useRecorderTimeline({
    position: state.position,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  });

  const playMutation = useMutation({
    mutationFn: () => {
      return runtime.play();
    },
  });
  const recordMutation = useMutation({
    mutationFn: async (action: "start" | "stop") => {
      if (action === "start") {
        await runtime.startRecording();
      }
      if (action === "stop") {
        await runtime.stopRecording();
        runtime.pause();
      }
    },
  });
  const audioTrackMutation = useMutation({
    mutationFn: ({ file, id }: { file: File; id: string }) => {
      return runtime.setAudioTrack(id, file);
    },
  });
  const addAudioMutation = useMutation({
    mutationFn: async (input: File) => {
      const files = await resolveAudioFiles(input);
      for (const file of files) {
        const id = runtime.addAudioTrack();
        await runtime.setAudioTrack(id, file);
      }
    },
  });

  const take = state.recordingTrack.takes[0];
  const isRecording = state.captureStatus === "recording";
  const isProcessing = state.captureStatus === "processing";
  const error =
    input.error ??
    addAudioMutation.error ??
    audioTrackMutation.error ??
    playMutation.error ??
    recordMutation.error;

  function togglePlay() {
    if (isProcessing) {
      return;
    }
    if (isRecording) {
      recordMutation.mutate("stop");
    } else if (state.isPlaying) {
      runtime.pause();
    } else {
      playMutation.mutate();
    }
  }

  function toggleRecord() {
    if (isProcessing || state.captureStatus === "disabled") {
      return;
    }
    recordMutation.mutate(isRecording ? "stop" : "start");
  }

  useWindowEvent("keydown", (event) => {
    if (isShortcutTextInputTarget(event.target) || event.repeat) {
      return;
    }
    if (matchKeyboardEvent(event, "Space")) {
      event.preventDefault();
      togglePlay();
    } else if (matchKeyboardEvent(event, "R")) {
      event.preventDefault();
      toggleRecord();
    } else if (matchKeyboardEvent(event, "M")) {
      event.preventDefault();
      runtime.setMetronomeEnabled(!state.metronomeEnabled);
    }
  });

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      <RecorderHeader
        isPlaying={state.isPlaying}
        isProcessing={isProcessing}
        isRecording={isRecording}
        metronomeEnabled={state.metronomeEnabled}
        position={state.position}
        tempo={timeline.tempo}
        timeSignature={timeline.timeSignature}
        gridDivision={timeline.gridDivision}
        recordDisabled={state.captureStatus === "disabled"}
        onPlayToggle={togglePlay}
        onRecordToggle={toggleRecord}
        onTempoChange={(tempo) => runtime.setTempo(tempo)}
        onMetronomeChange={(enabled) => runtime.setMetronomeEnabled(enabled)}
        onTimeSignatureChange={(timeSignature) =>
          runtime.setTimeSignature(parseTimeSignature(timeSignature))
        }
        onGridDivisionChange={timeline.setGridDivision}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(44rem,1fr)_18rem]">
        <section className="relative min-w-0 overflow-auto border-r border-neutral-700">
          <div
            ref={timeline.viewportRef}
            className="pointer-events-none absolute inset-y-0 left-[13.5rem] right-0"
          />
          <div className="relative">
            {timeline.showPlayhead && (
              <div className="pointer-events-none absolute inset-y-0 left-[13.5rem] right-0 z-30 overflow-hidden">
                <div
                  className="absolute inset-y-0 w-px bg-sky-400"
                  style={{ left: timeline.playheadX }}
                />
              </div>
            )}
            <TimelineHeader
              pixelsPerBeat={timeline.pixelsPerBeat}
              beatsPerBar={timeline.beatsPerBar}
              subdivisionsPerBeat={timeline.subdivisionsPerBeat}
              viewportStartBeat={timeline.viewportStartBeat}
              tempo={timeline.tempo}
              timelineWidth={timeline.viewportWidth}
              isAddingAudio={addAudioMutation.isPending}
              onAddAudioTrack={() => runtime.addAudioTrack()}
              onAddAudioFile={(file) => addAudioMutation.mutate(file)}
              onSeek={(position) => runtime.seek(position)}
            />
            {state.audioTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                title={`Audio ${index + 1}`}
                subtitle={track.clip?.name ?? "No file loaded"}
                height={track.height}
                gain={track.gain}
                muted={track.muted}
                soloed={track.soloed}
                onGainChange={(gain) =>
                  runtime.setAudioTrackMix(track.id, { gain })
                }
                onMutedChange={(muted) =>
                  runtime.setAudioTrackMix(track.id, { muted })
                }
                onSoloedChange={(soloed) =>
                  runtime.setAudioTrackMix(track.id, { soloed })
                }
                onHeightChange={(height) =>
                  runtime.setAudioTrackHeight(track.id, height)
                }
                action={
                  <AudioTrackActions
                    label={`Audio ${index + 1}`}
                    onFileChange={(file) =>
                      audioTrackMutation.mutate({ file, id: track.id })
                    }
                    onRemove={() => runtime.removeAudioTrack(track.id)}
                  />
                }
              >
                <TimelineLane
                  clip={
                    track.clip
                      ? {
                          duration: track.clip.duration,
                          label: track.clip.name,
                          offset: track.timelineOffset,
                          variant: "audio",
                          audioView: track.clip.audioView,
                        }
                      : undefined
                  }
                  pixelsPerBeat={timeline.pixelsPerBeat}
                  beatsPerBar={timeline.beatsPerBar}
                  subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                  viewportStartBeat={timeline.viewportStartBeat}
                  tempo={timeline.tempo}
                  viewportWidth={timeline.viewportWidth}
                  emptyLabel="Load an audio file"
                  onClipOffsetChange={(offset) =>
                    runtime.setAudioTrackOffset(track.id, offset)
                  }
                  onClipDragEnd={() => {
                    if (state.isPlaying) {
                      runtime.pause();
                      playMutation.mutate();
                    }
                  }}
                  onSeek={(position) => runtime.seek(position)}
                />
              </TrackRow>
            ))}

            <TrackRow
              title="Capture"
              subtitle={
                isRecording
                  ? `Recording · ${formatTimeWithMilliseconds(take?.duration ?? 0)}`
                  : take
                    ? `Take 1 · ${formatTimeWithMilliseconds(take.duration)}`
                    : "No take"
              }
              gain={state.recordingTrack.gain}
              height={state.recordingTrack.height}
              muted={state.recordingTrack.muted}
              soloed={state.recordingTrack.soloed}
              onGainChange={(gain) => runtime.setRecordingTrackMix({ gain })}
              onMutedChange={(muted) => runtime.setRecordingTrackMix({ muted })}
              onSoloedChange={(soloed) =>
                runtime.setRecordingTrackMix({ soloed })
              }
              onHeightChange={(height) =>
                runtime.setRecordingTrackHeight(height)
              }
            >
              <TimelineLane
                clip={
                  take
                    ? {
                        duration: take.duration,
                        label: isRecording
                          ? "Recording..."
                          : isProcessing
                            ? "Finalizing..."
                            : "Take 1",
                        offset: state.getTakeOffset(),
                        variant: isRecording ? "recording" : "take",
                        audioView: take.audioView,
                      }
                    : undefined
                }
                pixelsPerBeat={timeline.pixelsPerBeat}
                beatsPerBar={timeline.beatsPerBar}
                subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                viewportStartBeat={timeline.viewportStartBeat}
                tempo={timeline.tempo}
                viewportWidth={timeline.viewportWidth}
                emptyLabel="Enable input, place the playhead, then record"
                onSeek={(position) => runtime.seek(position)}
              />
            </TrackRow>
          </div>
        </section>

        <InputInspector
          devices={input.devices}
          error={error}
          hasAccess={input.hasAccess}
          inputActive={input.active}
          inputPeak={input.peak}
          inputsInitialized={input.initialized}
          isProcessing={isProcessing}
          isRecording={isRecording}
          selectedDevice={input.selectedDevice}
          selectedChannel={state.selectedChannel}
          inputChannelCount={state.inputChannelCount}
          latencyCompensation={state.latencyCompensation}
          inputTogglePending={input.togglePending}
          mutationPending={input.mutationPending}
          onDeviceChange={input.selectDevice}
          onInputToggle={input.toggle}
          onChannelChange={(channel) => {
            input.setPeak(0);
            input.selectChannel(channel);
          }}
          onLatencyCompensationChange={(compensation) => {
            const wasPlaying = state.isPlaying;
            if (wasPlaying) {
              runtime.pause();
            }
            input.setLatencyCompensation(compensation);
            if (wasPlaying) {
              playMutation.mutate();
            }
          }}
        />
      </div>
    </main>
  );
}

function useRecorderInput({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const active = state.captureStatus !== "disabled";
  const [preference, setPreference] = useState(() =>
    recorderStorage.readPreferences(),
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(preference.input?.deviceId);
  const [peak, setPeak] = useState(0);

  async function refresh() {
    const nextDevices = await getCaptureInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some(
        (device) => device.deviceId === preference.input?.deviceId,
      )
        ? preference.input?.deviceId
        : nextDevices[0]?.deviceId,
      { remember: false },
    );
  }

  function selectDevice(
    nextDeviceId?: string,
    { remember = true }: { remember?: boolean } = {},
  ) {
    if (nextDeviceId !== deviceId && active) {
      stop();
    }
    setDeviceId(nextDeviceId);
    if (remember) {
      const nextPreference = {
        ...preference,
        input: nextDeviceId
          ? { deviceId: nextDeviceId, channel: 0 }
          : undefined,
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    }
  }

  function stop() {
    runtime.stopInput();
    setPeak(0);
    startMutation.reset();
  }

  const grantMutation = useMutation({
    mutationFn: async () => {
      await requestCaptureAccess();
      await refresh();
    },
  });

  const refreshMutation = useMutation({ mutationFn: refresh });

  const startMutation = useMutation({
    mutationFn: async (nextDeviceId: string) => {
      const { channelCount } = await runtime.startInput({
        deviceId: nextDeviceId,
        onLevel: setPeak,
      });
      runtime.selectChannel(
        Math.min(preference.input?.channel ?? 0, channelCount - 1),
      );
      runtime.setLatencyCompensation(
        preference.input?.latencyCompensation ?? 0,
      );
    },
  });

  // refresh on mount and watch for device changes
  useEffect(() => {
    const refreshInputs = () => refreshMutation.mutate();
    refreshInputs();
    navigator.mediaDevices.addEventListener("devicechange", refreshInputs);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refreshInputs);
  }, [refreshMutation.mutate]);

  // The initial device enumeration has settled, so the UI can leave loading state.
  const initialized = refreshMutation.isSuccess || refreshMutation.isError;
  const hasAccess = devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);

  return {
    active,
    devices,
    error: grantMutation.error ?? refreshMutation.error ?? startMutation.error,
    hasAccess,
    initialized,
    mutationPending:
      refreshMutation.isPending ||
      grantMutation.isPending ||
      startMutation.isPending,
    peak,
    setPeak,
    selectedDevice,
    selectDevice,
    selectChannel: (channel: number) => {
      runtime.selectChannel(channel);
      if (!deviceId) {
        return;
      }
      const nextPreference = {
        ...preference,
        input: { ...preference.input, deviceId, channel },
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    },
    setLatencyCompensation: (latencyCompensation: number) => {
      runtime.setLatencyCompensation(latencyCompensation);
      if (!preference.input) {
        return;
      }
      const nextPreference = {
        ...preference,
        input: { ...preference.input, latencyCompensation },
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    },
    toggle: () => {
      if (!hasAccess) {
        grantMutation.mutate();
      } else if (active) {
        stop();
      } else if (selectedDevice) {
        setPeak(0);
        startMutation.mutate(selectedDevice.deviceId);
      }
    },
    togglePending: grantMutation.isPending || startMutation.isPending,
  };
}

function useRecorderTimeline({
  position,
  tempo,
  timeSignature,
}: {
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
}) {
  const [gridDivision, setGridDivision] = useState<GridDivision>(
    DEFAULT_GRID_DIVISION,
  );
  const [pixelsPerBeat, setPixelsPerBeat] = useState(DEFAULT_PIXELS_PER_BEAT);
  const [viewportStartBeat, setViewportStartBeat] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const subdivisionsPerBeat = getSubdivisionsPerBeat(gridDivision);
  const playheadX =
    (secondsToBeats(position, tempo) - viewportStartBeat) * pixelsPerBeat;
  const showPlayhead = playheadX >= 0 && playheadX <= viewportWidth;

  function zoom(nextPixelsPerBeat: number, anchorX: number) {
    const beatAtAnchor = anchorX / pixelsPerBeat + viewportStartBeat;
    setPixelsPerBeat(nextPixelsPerBeat);
    setViewportStartBeat(
      Math.max(0, beatAtAnchor - anchorX / nextPixelsPerBeat),
    );
  }

  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        setViewportWidth(entry.contentRect.width);
      });
      observer.observe(viewport);
      const wheelTarget = viewport.parentElement;
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (!event.ctrlKey) {
          const delta = event.deltaX || event.deltaY;
          setViewportStartBeat((value) =>
            Math.max(0, value + delta / pixelsPerBeat),
          );
          return;
        }
        if (event.deltaY === 0) {
          return;
        }
        const rect = viewport.getBoundingClientRect();
        const nextPixelsPerBeat = Math.max(
          MIN_PIXELS_PER_BEAT,
          Math.min(
            MAX_PIXELS_PER_BEAT,
            pixelsPerBeat * (event.deltaY > 0 ? 0.9 : 1.1),
          ),
        );
        zoom(nextPixelsPerBeat, Math.max(0, event.clientX - rect.left));
      };
      wheelTarget?.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        observer.disconnect();
        wheelTarget?.removeEventListener("wheel", handleWheel);
      };
    },
    [pixelsPerBeat, viewportStartBeat],
  );

  return {
    beatsPerBar,
    gridDivision,
    pixelsPerBeat,
    playheadX,
    viewportStartBeat,
    setGridDivision,
    subdivisionsPerBeat,
    tempo,
    timeSignature,
    viewportRef,
    viewportWidth,
    showPlayhead,
  };
}

function RecorderHeader({
  isPlaying,
  isProcessing,
  isRecording,
  metronomeEnabled,
  position,
  tempo,
  timeSignature,
  gridDivision,
  recordDisabled,
  onPlayToggle,
  onRecordToggle,
  onTempoChange,
  onMetronomeChange,
  onTimeSignatureChange,
  onGridDivisionChange,
}: {
  isPlaying: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  metronomeEnabled: boolean;
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
  gridDivision: GridDivision;
  recordDisabled: boolean;
  onPlayToggle: () => void;
  onRecordToggle: () => void;
  onTempoChange: (tempo: number) => void;
  onMetronomeChange: (enabled: boolean) => void;
  onTimeSignatureChange: (value: string) => void;
  onGridDivisionChange: (value: GridDivision) => void;
}) {
  const timeSignatureValue = `${timeSignature.numerator}/${timeSignature.denominator}`;
  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: onTempoChange,
    min: 30,
    max: 300,
  });
  const handleTapTempo = useTapTempo({
    min: 30,
    max: 300,
    onTempoChange,
  });
  return (
    <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm">
      <Mic2Icon className="size-4 text-emerald-400" />
      <span className="mr-2 text-sm font-medium">Recorder</span>
      <div className="h-5 w-px bg-neutral-600" />
      <Button
        data-testid="recorder-play-button"
        onClick={onPlayToggle}
        disabled={isProcessing}
        aria-pressed={isPlaying}
        className={cn(
          "size-9",
          isPlaying
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={isRecording || isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </Button>
      <Button
        onClick={() => onMetronomeChange(!metronomeEnabled)}
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
      <Button
        data-testid="recorder-record-button"
        onClick={onRecordToggle}
        disabled={recordDisabled || isProcessing}
        aria-pressed={isRecording}
        className={cn(
          "size-9",
          isRecording
            ? "bg-red-600 text-white hover:bg-red-500"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={isRecording ? "Stop recording (R)" : "Record (R)"}
      >
        {isRecording ? (
          <CircleStopIcon className="size-5" />
        ) : (
          <CircleIcon className="size-4 fill-current" />
        )}
      </Button>
      <div className="mx-1 h-5 w-px bg-neutral-600" />
      <output
        data-testid="recorder-position"
        className="font-mono text-sm tabular-nums text-neutral-300"
      >
        {formatBarBeatAtTime({ seconds: position, tempo, timeSignature })} -{" "}
        {formatTimeWithMilliseconds(position)}
      </output>
      <div className="h-5 w-px bg-neutral-600" />
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span>BPM</span>
        <input
          data-testid="recorder-tempo-input"
          type="text"
          inputMode="numeric"
          {...tempoInput.props}
          className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-sm text-neutral-100"
        />
        <Button
          data-testid="recorder-tap-tempo-button"
          onClick={handleTapTempo}
          title="Tap tempo"
          className="h-8 px-1.5 text-xs hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          TAP
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800">
            {timeSignatureValue}
            <ChevronDownIcon className="size-3 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={timeSignatureValue}
            onValueChange={(value) => onTimeSignatureChange(value)}
          >
            {COMMON_TIME_SIGNATURES.map(({ numerator, denominator }) => {
              const value = `${numerator}/${denominator}`;
              return (
                <DropdownMenuRadioItem key={value} value={value}>
                  {value}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800">
            {gridDivision}
            <ChevronDownIcon className="size-3 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={gridDivision}
            onValueChange={(value) =>
              onGridDivisionChange(value as GridDivision)
            }
          >
            {GRID_DIVISIONS.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            title="More"
            aria-label="More"
            className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
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
  );
}

function TimelineHeader({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  timelineWidth,
  isAddingAudio,
  subdivisionsPerBeat,
  onAddAudioTrack,
  onAddAudioFile,
  onSeek,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  timelineWidth: number;
  isAddingAudio: boolean;
  subdivisionsPerBeat: number;
  onAddAudioTrack: () => void;
  onAddAudioFile: (file: File) => void;
  onSeek: (position: number) => void;
}) {
  return (
    <div className="sticky top-0 z-10 grid h-10 grid-cols-[13.5rem_1fr] border-b border-neutral-700 bg-neutral-800">
      <div className="sticky left-0 z-20 flex items-center border-r border-neutral-700 bg-neutral-800 px-3 text-xs font-semibold">
        <span>Tracks</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          <Button
            onClick={onAddAudioTrack}
            disabled={isAddingAudio}
            className="size-7 hover:bg-neutral-700"
            title="Add empty audio track"
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Button
            data-testid="recorder-add-audio-file"
            disabled={isAddingAudio}
            onClick={() =>
              openFilePicker({
                accept: "audio/*,.zip,application/zip",
                onFile: onAddAudioFile,
              })
            }
            title={
              isAddingAudio ? "Loading audio..." : "Add audio tracks from file"
            }
            className="size-7 hover:bg-neutral-700"
          >
            {isAddingAudio ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <UploadIcon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      <TimelineRuler
        beatsPerBar={beatsPerBar}
        pixelsPerBeat={pixelsPerBeat}
        viewportStartBeat={viewportStartBeat}
        tempo={tempo}
        subdivisionsPerBeat={subdivisionsPerBeat}
        timelineWidth={timelineWidth}
        onSeek={onSeek}
      />
    </div>
  );
}

function AudioTrackActions({
  label,
  onFileChange,
  onRemove,
}: {
  label: string;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
          title={`${label} actions`}
        >
          <MoreVerticalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            openFilePicker({ accept: "audio/*,.wav", onFile: onFileChange })
          }
        >
          <UploadIcon />
          Replace audio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} className="text-red-400">
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TimelineRuler({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  subdivisionsPerBeat,
  timelineWidth,
  onSeek,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  subdivisionsPerBeat: number;
  timelineWidth: number;
  onSeek: (position: number) => void;
}) {
  const labelEveryBars = getVisibleBarInterval({
    barWidth: beatsPerBar * pixelsPerBeat,
    minimumPixelSpacing: 48,
  });
  const labelEveryBeats = labelEveryBars * beatsPerBar;
  const firstLabelBeat =
    Math.floor(viewportStartBeat / labelEveryBeats) * labelEveryBeats;
  const visibleBeats = timelineWidth / pixelsPerBeat;
  const labelCount =
    Math.ceil(
      (viewportStartBeat + visibleBeats - firstLabelBeat) / labelEveryBeats,
    ) + 1;
  return (
    <div
      data-testid="recorder-timeline-ruler"
      className="relative cursor-pointer font-mono text-[10px] text-neutral-400"
      style={getTimelineGridStyle({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(
          0,
          (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        );
        onSeek(beatsToSeconds(beat, tempo));
      }}
    >
      {Array.from({ length: Math.max(0, labelCount) }, (_, index) => {
        const beat = firstLabelBeat + index * labelEveryBeats;
        return (
          <span
            key={beat}
            className="absolute bottom-1.5"
            style={{ left: (beat - viewportStartBeat) * pixelsPerBeat + 6 }}
          >
            {beat / beatsPerBar + 1}
          </span>
        );
      })}
    </div>
  );
}

function TrackRow({
  title,
  subtitle,
  height,
  gain,
  muted,
  soloed,
  action,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  onHeightChange,
  children,
}: {
  title: string;
  subtitle: string;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  action?: React.ReactNode;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}) {
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return { startClientY: event.clientY, startHeight: height };
    },
    onMove: (event, drag) => {
      onHeightChange(drag.startHeight + event.clientY - drag.startClientY);
    },
  });
  const toggleClass = (active: boolean) =>
    active
      ? "size-7 border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600"
      : "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700";
  return (
    <div
      className="relative grid grid-cols-[13.5rem_1fr] border-b border-neutral-700"
      style={{ height }}
    >
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-r border-neutral-700 bg-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-400">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          {action}
          <Button
            onClick={() => onMutedChange(!muted)}
            className={toggleClass(muted)}
            title={muted ? `Unmute ${title}` : `Mute ${title}`}
          >
            M
          </Button>
          <Button
            onClick={() => onSoloedChange(!soloed)}
            className={toggleClass(soloed)}
            title={soloed ? `Disable ${title} solo` : `Solo ${title}`}
          >
            S
          </Button>
        </div>
        <label className="col-span-2 mt-auto grid grid-cols-[1fr_3.5rem] items-center gap-2 text-[10px] text-neutral-400">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-500/70"
              style={{ left: `${dbToPercent(0)}%` }}
            />
            <input
              aria-label={`${title} gain`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={gainToPercent(gain)}
              onChange={(event) =>
                onGainChange(percentToGain(event.currentTarget.valueAsNumber))
              }
              className="w-full accent-emerald-600"
            />
          </div>
          <span className="text-right font-mono">{formatGainDb(gain)}</span>
        </label>
      </div>
      {children}
      <div
        ref={resizeRef}
        className="absolute inset-x-0 -bottom-1 z-30 h-2 cursor-ns-resize"
        title={`Resize ${title}`}
      />
    </div>
  );
}

type RecorderTimelineClip = {
  duration: number;
  label: string;
  offset: number;
  variant: "audio" | "take" | "recording";
  audioView?: AudioView;
};

function TimelineLane({
  beatsPerBar,
  clip,
  emptyLabel,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  onClipOffsetChange,
  onClipDragEnd,
  subdivisionsPerBeat,
  onSeek,
}: {
  beatsPerBar: number;
  clip?: RecorderTimelineClip;
  emptyLabel: string;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  onClipOffsetChange?: (offset: number) => void;
  onClipDragEnd?: () => void;
  subdivisionsPerBeat: number;
  onSeek: (position: number) => void;
}) {
  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      style={getTimelineGridStyle({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(
          0,
          (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        );
        onSeek(beatsToSeconds(beat, tempo));
      }}
    >
      {clip ? (
        <TimelineClip
          clip={clip}
          pixelsPerBeat={pixelsPerBeat}
          viewportStartBeat={viewportStartBeat}
          tempo={tempo}
          viewportWidth={viewportWidth}
          onClipOffsetChange={onClipOffsetChange}
          onClipDragEnd={onClipDragEnd}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function TimelineClip({
  clip,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  onClipOffsetChange,
  onClipDragEnd,
}: {
  clip: RecorderTimelineClip;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  onClipOffsetChange?: (offset: number) => void;
  onClipDragEnd?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
      return {
        startClientX: event.clientX,
        startOffset: clip!.offset,
        pixelsPerBeat,
        tempo,
      };
    },
    onMove: (event, drag) => {
      const deltaBeats =
        (event.clientX - drag.startClientX) / drag.pixelsPerBeat;
      onClipOffsetChange!(
        Math.max(0, drag.startOffset + beatsToSeconds(deltaBeats, drag.tempo)),
      );
    },
    onEnd: () => {
      setIsDragging(false);
      onClipDragEnd?.();
    },
  });
  const clipClass = {
    audio: "border-emerald-400/60 bg-emerald-400/20 text-emerald-100",
    take: "border-emerald-400/60 bg-emerald-400/20 text-emerald-100",
    recording: "border-red-400/70 bg-red-400/20 text-red-100",
  }[clip.variant];
  const clipStartBeat = secondsToBeats(clip.offset, tempo);
  const clipWidth = Math.max(
    2,
    secondsToBeats(clip.duration, tempo) * pixelsPerBeat,
  );
  const visibleStart = Math.max(
    0,
    beatsToSeconds(viewportStartBeat - clipStartBeat, tempo),
  );
  const visibleEnd = Math.min(
    clip.duration,
    beatsToSeconds(
      viewportStartBeat + viewportWidth / pixelsPerBeat - clipStartBeat,
      tempo,
    ),
  );
  return (
    <div
      data-testid={`recorder-clip-${clip.variant}`}
      ref={onClipOffsetChange ? dragRef : undefined}
      className={cn(
        "absolute inset-y-1 overflow-hidden rounded-sm border text-[11px]",
        clipClass,
        onClipOffsetChange && "cursor-ew-resize select-none",
        isDragging && "brightness-125",
      )}
      style={{
        left: (clipStartBeat - viewportStartBeat) * pixelsPerBeat,
        width: clipWidth,
      }}
    >
      {clip.audioView && visibleEnd > visibleStart && (
        <AudioWaveformView
          audioView={clip.audioView}
          audioDuration={clip.duration}
          visibleStart={visibleStart}
          visibleEnd={visibleEnd}
          pixelWidth={clipWidth}
        />
      )}
      <div className="absolute left-1 top-0.5 z-10 whitespace-nowrap">
        <span className="mr-1.5">{clip.label}</span>
        {onClipOffsetChange && clip.offset > 0 && (
          <span className="opacity-75">+{clip.offset.toFixed(3)}s</span>
        )}
      </div>
    </div>
  );
}

function getTimelineGridStyle({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): React.CSSProperties {
  return getTimelineGridBackground({
    beatsPerBar,
    colors: {
      bar: "rgb(82 82 82)",
      beat: "rgb(64 64 64)",
      subdivision: "rgb(51 51 51)",
    },
    minimumPixelSpacing: 8,
    pixelsPerBeat,
    viewportStartBeat,
    subdivisionsPerBeat,
  });
}

function InputInspector({
  devices,
  error,
  hasAccess,
  inputActive,
  inputPeak,
  inputsInitialized,
  isProcessing,
  isRecording,
  selectedDevice,
  selectedChannel,
  inputChannelCount,
  latencyCompensation,
  inputTogglePending,
  mutationPending,
  onDeviceChange,
  onInputToggle,
  onChannelChange,
  onLatencyCompensationChange,
}: {
  devices: MediaDeviceInfo[];
  error?: Error | null;
  hasAccess: boolean;
  inputActive: boolean;
  inputPeak: number;
  inputsInitialized: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  selectedDevice?: MediaDeviceInfo;
  selectedChannel: number;
  inputChannelCount: number;
  latencyCompensation: number;
  inputTogglePending: boolean;
  mutationPending: boolean;
  onDeviceChange: (deviceId?: string) => void;
  onInputToggle: () => void;
  onChannelChange: (channel: number) => void;
  onLatencyCompensationChange: (compensation: number) => void;
}) {
  const disabled = mutationPending || isRecording || isProcessing;
  const latencyInput = useDraftInput({
    value: latencyCompensation * 1000,
    onCommit: (milliseconds) =>
      onLatencyCompensationChange(milliseconds / 1000),
    min: 0,
  });
  const inputClass =
    "mt-1 h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-100 disabled:text-neutral-500";
  return (
    <aside className="min-h-0 overflow-y-auto bg-neutral-800">
      <h2 className="flex h-10 items-center border-b border-neutral-700 px-3 text-xs font-semibold">
        Input
      </h2>
      <div className="space-y-4 border-b border-neutral-700 p-3">
        <label className="block text-[11px] font-medium text-neutral-400">
          Device
          <select
            value={selectedDevice?.deviceId ?? ""}
            disabled={disabled || !inputsInitialized || !hasAccess}
            onChange={(event) =>
              onDeviceChange(event.currentTarget.value || undefined)
            }
            className={inputClass}
          >
            {!inputsInitialized ? (
              <option>Loading audio inputs...</option>
            ) : !hasAccess ? (
              <option>Grant microphone access</option>
            ) : (
              <>
                {!selectedDevice && (
                  <option value="">Choose an audio input</option>
                )}
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Audio input ${index + 1}`}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <label className="block text-[11px] font-medium text-neutral-400">
          Channel
          <select
            value={inputChannelCount > 0 ? selectedChannel : ""}
            disabled={disabled || inputChannelCount === 0}
            onChange={(event) =>
              onChannelChange(Number(event.currentTarget.value))
            }
            className={inputClass}
          >
            {inputChannelCount === 0 ? (
              <option value="">Enable input to detect channels</option>
            ) : (
              Array.from({ length: inputChannelCount }, (_, channel) => (
                <option key={channel} value={channel}>
                  Channel {channel + 1}
                </option>
              ))
            )}
          </select>
        </label>
        <Button
          disabled={
            disabled || !inputsInitialized || (hasAccess && !selectedDevice)
          }
          onClick={onInputToggle}
          className="h-8 w-full justify-start gap-2 border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          <Mic2Icon className="size-3.5" />
          {inputTogglePending
            ? "Loading..."
            : !inputsInitialized
              ? "Enable input"
              : hasAccess
                ? inputActive
                  ? "Disable input"
                  : "Enable input"
                : "Grant access"}
        </Button>
        <label className="block text-[11px] font-medium text-neutral-400">
          Level
          <div className="mt-2">
            <InputMeter active={inputActive} peak={inputPeak} />
          </div>
        </label>
        <label className="block text-[11px] font-medium text-neutral-400">
          <span className="flex items-center gap-1.5">
            Latency compensation
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="About latency compensation"
                  className="text-neutral-500 hover:text-neutral-200"
                >
                  <CircleHelpIcon className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 space-y-2 p-3 text-xs"
              >
                <p>
                  Advances recorded audio to compensate for input and output
                  latency.
                </p>
                <a
                  href={routes.latencyChecker.href()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Open latency checker
                </a>
              </PopoverContent>
            </Popover>
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              {...latencyInput.props}
              className="h-8 min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-xs text-neutral-100"
            />
            <span>ms</span>
          </div>
        </label>
      </div>

      {error && (
        <div className="m-3 border border-orange-700/60 bg-orange-950/40 p-3 text-xs text-orange-200">
          {error.message}
        </div>
      )}
    </aside>
  );
}
