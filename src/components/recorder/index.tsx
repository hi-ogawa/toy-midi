import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleIcon,
  CircleHelpIcon,
  CircleStopIcon,
  DownloadIcon,
  HouseIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  Mic2Icon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  SaveCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { useDraftInput } from "../../hooks/use-draft-input";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { useTapTempo } from "../../hooks/use-tap-tempo";
import { useWindowEvent } from "../../hooks/use-window-event";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { resolveAudioFiles } from "../../lib/audio-files";
import { AudioView } from "../../lib/audio-view";
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
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
import { recorderProjectStorage } from "../../lib/recorder/project-storage";
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
import { encodeWav } from "../../lib/wav";
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
import { Dialog } from "../ui/dialog";
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

export function Recorder({ projectId }: { projectId: string }) {
  const [runtime] = useState(() => new RecorderRuntime());
  const [isInputSetupOpen, setIsInputSetupOpen] = useState(false);
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const input = useRecorderInput({
    runtime,
    state,
  });
  const timeline = useRecorderTimeline({
    isPlaying: state.isPlaying,
    position: state.position,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  });
  const project = useRecorderProject({ projectId, runtime });
  const clipInteraction = useRecorderClipInteraction({
    runtime,
    state,
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

  const takes = state.recordingTrack.takes;
  const isRecording = state.captureStatus === "recording";
  const isProcessing = state.captureStatus === "processing";

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

  const saveDisabled =
    !project.ready ||
    !project.dirty ||
    project.saving ||
    isRecording ||
    isProcessing;

  useWindowEvent("keydown", (event) => {
    if (matchKeyboardEvent(event, "Ctrl+S") && !event.repeat) {
      event.preventDefault();
      if (!saveDisabled) {
        project.save();
      }
      return;
    }
    if (isShortcutTextInputTarget(event.target) || event.repeat) {
      return;
    }
    if (matchKeyboardEvent(event, "Escape") && clipInteraction.hasSelection) {
      event.preventDefault();
      clipInteraction.clear();
    } else if (
      clipInteraction.hasSelection &&
      (matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace"))
    ) {
      event.preventDefault();
      clipInteraction.removeSelected();
    } else if (matchKeyboardEvent(event, "Space")) {
      event.preventDefault();
      togglePlay();
    } else if (matchKeyboardEvent(event, "R")) {
      event.preventDefault();
      toggleRecord();
    } else if (matchKeyboardEvent(event, "M")) {
      event.preventDefault();
      runtime.setMetronomeEnabled(!state.metronomeEnabled);
    } else if (matchKeyboardEvent(event, "F")) {
      event.preventDefault();
      timeline.setAutoScrollEnabled(!timeline.autoScrollEnabled);
    }
  });

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      <RecorderHeader
        title={state.title}
        saveStatus={project.saveStatus}
        isPlaying={state.isPlaying}
        isProcessing={isProcessing}
        isRecording={isRecording}
        autoScrollEnabled={timeline.autoScrollEnabled}
        metronomeEnabled={state.metronomeEnabled}
        position={state.position}
        tempo={timeline.tempo}
        timeSignature={timeline.timeSignature}
        gridDivision={timeline.gridDivision}
        recordDisabled={state.captureStatus === "disabled"}
        onPlayToggle={togglePlay}
        onTitleChange={(nextTitle) => {
          runtime.setTitle(nextTitle);
        }}
        onSave={project.save}
        onRecordToggle={toggleRecord}
        onAutoScrollChange={timeline.setAutoScrollEnabled}
        onTempoChange={(tempo) => runtime.setTempo(tempo)}
        onMetronomeChange={(enabled) => runtime.setMetronomeEnabled(enabled)}
        onTimeSignatureChange={(timeSignature) =>
          runtime.setTimeSignature(parseTimeSignature(timeSignature))
        }
        onGridDivisionChange={timeline.setGridDivision}
      />

      <div className="min-h-0 flex-1">
        <section className="relative h-full min-w-0 overflow-x-hidden overflow-y-auto">
          <div
            ref={timeline.viewportRef}
            className="pointer-events-none absolute inset-y-0 left-[15rem] right-0"
          />
          <div className="relative">
            {timeline.showPlayhead && (
              <div className="pointer-events-none absolute inset-y-0 left-[15rem] right-0 z-30 overflow-hidden">
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
                          duration: track.trimEnd - track.trimStart,
                          label: track.clip.name,
                          offset: track.timelineOffset + track.trimStart,
                          variant: "audio",
                          audioView: track.clip.audioView,
                          audioDuration: track.clip.buffer.duration,
                          audioOffset: track.trimStart,
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
                  selected={clipInteraction.isSelected({
                    type: "audio",
                    id: track.id,
                  })}
                  onClipClick={(additive) =>
                    clipInteraction.select(
                      { type: "audio", id: track.id },
                      additive,
                    )
                  }
                  onTrimStartChange={(trimStart) =>
                    runtime.setAudioTrackTrimStart(track.id, trimStart)
                  }
                  onTrimEndChange={(trimEnd) =>
                    runtime.setAudioTrackTrimEnd(track.id, trimEnd)
                  }
                  trimStart={track.trimStart}
                  trimEnd={track.trimEnd}
                  onClipDragStart={(additive) =>
                    clipInteraction.startMove({
                      clip: { type: "audio", id: track.id },
                      additive,
                    })
                  }
                  onClipDragMove={clipInteraction.move}
                  onSeek={(position) => {
                    clipInteraction.clear();
                    runtime.seek(position);
                  }}
                />
              </TrackRow>
            ))}

            <CaptureTrackRow
              route={input.route.label}
              routeNeedsSetup={input.route.needsSetup}
              subtitle={
                isProcessing
                  ? "Finalizing take…"
                  : isRecording
                    ? `Recording · ${formatTimeWithMilliseconds(state.pendingRecording?.duration ?? 0)}`
                    : takes.length > 0
                      ? `${takes.length} ${takes.length === 1 ? "take" : "takes"}`
                      : "No takes"
              }
              gain={state.recordingTrack.gain}
              height={state.recordingTrack.height}
              inputActive={input.active}
              inputAnalyser={runtime.captureInput?.analyser}
              inputToggleDisabled={
                input.mutationPending ||
                !input.initialized ||
                isRecording ||
                isProcessing ||
                (!input.active && input.route.needsSetup)
              }
              muted={state.recordingTrack.muted}
              soloed={state.recordingTrack.soloed}
              takeDownloadDisabled={
                takes.length === 0 || isRecording || isProcessing
              }
              onGainChange={(gain) => runtime.setRecordingTrackMix({ gain })}
              onInputSetup={() => setIsInputSetupOpen(true)}
              onInputToggle={input.toggle}
              onMutedChange={(muted) => runtime.setRecordingTrackMix({ muted })}
              onSoloedChange={(soloed) =>
                runtime.setRecordingTrackMix({ soloed })
              }
              onHeightChange={(height) =>
                runtime.setRecordingTrackHeight(height)
              }
              onTakeDownload={() => {
                const comp = runtime.renderComp();
                if (!comp) {
                  return;
                }
                downloadBlob(
                  encodeWav(comp),
                  buildExportFileName({
                    baseName: "toy-midi-recording",
                    extension: "wav",
                  }),
                );
              }}
            >
              <TakeTimelineLane
                takes={takes}
                pendingRecording={state.pendingRecording}
                captureStatus={state.captureStatus}
                isTakeSelected={(id) =>
                  clipInteraction.isSelected({ type: "take", id })
                }
                beatsPerBar={timeline.beatsPerBar}
                subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                pixelsPerBeat={timeline.pixelsPerBeat}
                tempo={timeline.tempo}
                viewportStartBeat={timeline.viewportStartBeat}
                viewportWidth={timeline.viewportWidth}
                onSeek={(position) => {
                  clipInteraction.clear();
                  runtime.seek(position);
                }}
                onTakeDragStart={(id, additive) =>
                  clipInteraction.startMove({
                    clip: { type: "take", id },
                    additive,
                  })
                }
                onTakeClick={(id, additive) =>
                  clipInteraction.select({ type: "take", id }, additive)
                }
                onTakeDragMove={clipInteraction.move}
                onTakeTrimStartChange={(id, trimStart) =>
                  runtime.setTakeTrimStart(id, trimStart)
                }
                onTakeTrimEndChange={(id, trimEnd) =>
                  runtime.setTakeTrimEnd(id, trimEnd)
                }
              />
            </CaptureTrackRow>
          </div>
        </section>

        <Dialog
          isOpen={isInputSetupOpen}
          onClose={() => setIsInputSetupOpen(false)}
          title="Audio Input Setup"
          testId="recorder-input-setup"
        >
          <InputSetup
            devices={input.devices}
            error={input.error}
            hasAccess={input.hasAccess}
            inputActive={input.active}
            inputAnalyser={runtime.captureInput?.analyser}
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
            onChannelChange={input.selectChannel}
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
        </Dialog>
      </div>
    </main>
  );
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

type RecorderClipId = { type: "audio" | "take"; id: string };

type RecorderClipMoveSnapshot = (RecorderClipId & {
  timelineOffset: number;
  visibleStart: number;
})[];

function useRecorderClipInteraction({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const [keys, setKeys] = useState(() => new Set<string>());

  function getKey(clip: RecorderClipId): string {
    return `${clip.type}:${clip.id}`;
  }

  function getSelectedClips(selectedKeys: ReadonlySet<string>) {
    return {
      audioTracks: state.audioTracks.filter((track) =>
        selectedKeys.has(getKey({ type: "audio", id: track.id })),
      ),
      takes: state.recordingTrack.takes.filter((take) =>
        selectedKeys.has(getKey({ type: "take", id: take.id })),
      ),
    };
  }

  useEffect(() => {
    const available = new Set([
      ...state.audioTracks
        .filter((track) => track.clip)
        .map((track) => getKey({ type: "audio", id: track.id })),
      ...state.recordingTrack.takes.map((take) =>
        getKey({ type: "take", id: take.id }),
      ),
    ]);
    setKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.recordingTrack.takes]);

  function select(clip: RecorderClipId, additive: boolean): void {
    const key = getKey(clip);
    if (!additive) {
      const next = keys.has(key) ? keys : new Set([key]);
      setKeys(next);
      return;
    }
    const next = new Set(keys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setKeys(next);
  }

  function startMove({
    clip,
    additive,
  }: {
    clip: RecorderClipId;
    additive: boolean;
  }): RecorderClipMoveSnapshot {
    const draggedKey = getKey(clip);
    // Dragging a selected clip preserves the group; an unselected clip joins
    // with Ctrl/Cmd or replaces the selection otherwise.
    const selectedKeys = keys.has(draggedKey)
      ? new Set(keys)
      : additive
        ? new Set([...keys, draggedKey])
        : new Set([draggedKey]);
    setKeys(selectedKeys);
    const selected = getSelectedClips(selectedKeys);
    return [
      ...selected.audioTracks.map((track) => ({
        type: "audio" as const,
        id: track.id,
        timelineOffset: track.timelineOffset,
        visibleStart: track.timelineOffset + track.trimStart,
      })),
      ...selected.takes.map((take) => ({
        type: "take" as const,
        id: take.id,
        timelineOffset: take.timelineOffset,
        visibleStart: take.timelineOffset + take.trimStart,
      })),
    ];
  }

  function move(clips: RecorderClipMoveSnapshot, delta: number): void {
    const minimumVisibleStart = Math.min(
      ...clips.map((clip) => clip.visibleStart),
    );
    const clampedDelta = Math.max(delta, -minimumVisibleStart);
    runtime.moveClips(
      clips.map((clip) => ({
        type: clip.type,
        id: clip.id,
        timelineOffset: clip.timelineOffset + clampedDelta,
      })),
    );
  }

  function removeSelected(): void {
    const selected = getSelectedClips(keys);
    if (selected.audioTracks.length + selected.takes.length !== 1) {
      return;
    }
    if (selected.audioTracks[0]) {
      runtime.clearAudioTrack(selected.audioTracks[0].id);
    } else {
      runtime.removeTake(selected.takes[0]!.id);
    }
    setKeys(new Set());
  }

  return {
    clear: () => setKeys(new Set()),
    hasSelection: keys.size > 0,
    isSelected: (clip: RecorderClipId) => keys.has(getKey(clip)),
    select,
    startMove,
    move,
    removeSelected,
  };
}

function useRecorderProject({
  projectId,
  runtime,
}: {
  projectId: string;
  runtime: RecorderRuntime;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["recorder-project", projectId],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const project = await recorderProjectStorage.load(projectId);
        runtime.deserializeProject(project);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unknown error");
        throw error;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const revision = revisionRef.current;
      await recorderProjectStorage.save({
        id: projectId,
        content: runtime.serializeProject(),
      });
      return revision;
    },
    onSuccess: (savedRevision) => {
      setDirty(revisionRef.current !== savedRevision);
    },
  });

  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.subscribePersistableState(() => {
      revisionRef.current += 1;
      setDirty(true);
    });
  }, [projectQuery.isSuccess, runtime]);

  useWindowEvent("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
    }
  });

  const saveStatus: SaveStatus = saveMutation.isError
    ? "error"
    : saveMutation.isPending
      ? "saving"
      : dirty
        ? "unsaved"
        : "saved";
  return {
    dirty,
    error: projectQuery.error ?? saveMutation.error,
    ready: projectQuery.isSuccess || projectQuery.isError,
    save: saveMutation.mutate,
    saveStatus,
    saving: saveMutation.isPending,
  };
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
  // Optimistically treat a pending grant as access so the UI does not flash
  // the permission callout between a successful prompt and device refresh.
  const hasAccess =
    grantMutation.isPending || devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);
  const route = !initialized
    ? { label: "Loading audio inputs…", needsSetup: false }
    : !hasAccess
      ? { label: "Microphone access required · Set up", needsSetup: true }
      : selectedDevice
        ? {
            label: `${selectedDevice.label || "Audio input"} · Input ${state.selectedChannel + 1}`,
            needsSetup: false,
          }
        : { label: "No input configured · Set up", needsSetup: true };

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
    route,
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
        startMutation.mutate(selectedDevice.deviceId);
      }
    },
    togglePending: grantMutation.isPending || startMutation.isPending,
  };
}

function useRecorderTimeline({
  isPlaying,
  position,
  tempo,
  timeSignature,
}: {
  isPlaying: boolean;
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
}) {
  const [gridDivision, setGridDivision] = useState<GridDivision>(
    DEFAULT_GRID_DIVISION,
  );
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(DEFAULT_PIXELS_PER_BEAT);
  const [viewportStartBeat, setViewportStartBeat] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const subdivisionsPerBeat = getSubdivisionsPerBeat(gridDivision);
  const playheadX =
    (secondsToBeats(position, tempo) - viewportStartBeat) * pixelsPerBeat;
  const showPlayhead = playheadX >= 0 && playheadX <= viewportWidth;

  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled || viewportWidth === 0) {
      return;
    }
    const playheadBeat = secondsToBeats(position, tempo);
    const visibleBeats = viewportWidth / pixelsPerBeat;
    if (
      playheadBeat < viewportStartBeat ||
      viewportStartBeat + visibleBeats * 0.9 < playheadBeat
    ) {
      setViewportStartBeat(Math.max(0, playheadBeat - visibleBeats * 0.1));
    }
  }, [
    autoScrollEnabled,
    isPlaying,
    pixelsPerBeat,
    position,
    tempo,
    viewportStartBeat,
    viewportWidth,
  ]);

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
    autoScrollEnabled,
    setAutoScrollEnabled,
  };
}

function RecorderHeader({
  title,
  saveStatus,
  isPlaying,
  isProcessing,
  isRecording,
  metronomeEnabled,
  position,
  tempo,
  timeSignature,
  gridDivision,
  recordDisabled,
  autoScrollEnabled,
  onPlayToggle,
  onTitleChange,
  onSave,
  onRecordToggle,
  onAutoScrollChange,
  onTempoChange,
  onMetronomeChange,
  onTimeSignatureChange,
  onGridDivisionChange,
}: {
  title: string;
  saveStatus: SaveStatus;
  isPlaying: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  metronomeEnabled: boolean;
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
  gridDivision: GridDivision;
  recordDisabled: boolean;
  autoScrollEnabled: boolean;
  onPlayToggle: () => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onRecordToggle: () => void;
  onAutoScrollChange: (enabled: boolean) => void;
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
      <Button
        onClick={() => onMetronomeChange(!metronomeEnabled)}
        aria-pressed={metronomeEnabled}
        title="Toggle metronome (M)"
        className={cn(
          "size-9",
          metronomeEnabled
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
        )}
      >
        <MetronomeIcon className="size-5" />
      </Button>
      <Button
        onClick={() => onAutoScrollChange(!autoScrollEnabled)}
        aria-pressed={autoScrollEnabled}
        title="Toggle auto-scroll (F)"
        className={cn(
          "size-9",
          autoScrollEnabled
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
        )}
      >
        <LocateFixedIcon className="size-5" />
      </Button>
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
      <RecorderSaveButton status={saveStatus} onSave={onSave} />
      <button
        type="button"
        data-testid="recorder-project-name"
        title="Rename project"
        onClick={() => {
          const nextTitle = window.prompt("Project name", title)?.trim();
          if (nextTitle && nextTitle !== title) {
            onTitleChange(nextTitle);
          }
        }}
        className="max-w-[220px] truncate text-sm text-neutral-300 hover:text-neutral-100"
      >
        {title}
      </button>
      <div className="h-5 w-px bg-neutral-600" />
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
          <DropdownMenuItem asChild>
            <a href={routes.recorder.href()}>
              <Mic2Icon />
              Recorder projects
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function RecorderSaveButton({
  status,
  onSave,
}: {
  status: SaveStatus;
  onSave: () => void;
}) {
  const canSave = status === "unsaved" || status === "error";
  const label = {
    saved: "All changes saved",
    unsaved: "Unsaved changes (Ctrl/Cmd+S to save)",
    saving: "Saving project",
    error: "Save failed (click or Ctrl/Cmd+S to retry)",
  }[status];
  const icon = {
    saved: <SaveCheckIcon className="size-4" />,
    unsaved: <SaveIcon className="size-4" />,
    saving: <LoaderCircleIcon className="size-3.5 animate-spin" />,
    error: <CircleAlertIcon className="size-3.5" />,
  }[status];
  return (
    <Button
      aria-label={label}
      title={label}
      aria-disabled={!canSave}
      onClick={canSave ? onSave : undefined}
      className={cn(
        "size-8 border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        status === "saved" && "text-neutral-500",
        status === "unsaved" && "text-neutral-300",
        status === "saving" && "text-neutral-400",
        status === "error" && "text-red-400 hover:text-red-300",
      )}
    >
      {icon}
    </Button>
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
    <div className="sticky top-0 z-10 grid h-10 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800">
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
  action: React.ReactNode;
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
      className="relative grid grid-cols-[15rem_1fr] border-b border-neutral-700"
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

function CaptureTrackRow({
  route,
  routeNeedsSetup,
  subtitle,
  height,
  gain,
  inputActive,
  inputAnalyser,
  inputToggleDisabled,
  muted,
  soloed,
  takeDownloadDisabled,
  onGainChange,
  onInputSetup,
  onInputToggle,
  onMutedChange,
  onSoloedChange,
  onTakeDownload,
  onHeightChange,
  children,
}: {
  route: string;
  routeNeedsSetup: boolean;
  subtitle: string;
  height: number;
  gain: number;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  inputToggleDisabled: boolean;
  muted: boolean;
  soloed: boolean;
  takeDownloadDisabled: boolean;
  onGainChange: (gain: number) => void;
  onInputSetup: () => void;
  onInputToggle: () => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onTakeDownload: () => void;
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
  const mixToggleClass = (active: boolean) =>
    active
      ? "size-7 border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600"
      : "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700";
  return (
    <div className="relative grid grid-cols-[15rem_1fr]" style={{ height }}>
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[2rem_1rem_0.75rem_1fr] gap-x-2 gap-y-1 border-r border-neutral-700 bg-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">Capture</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-400">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
                title="Capture actions"
                aria-label="Capture actions"
              >
                <MoreVerticalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid="recorder-download-take"
                disabled={takeDownloadDisabled}
                onSelect={onTakeDownload}
              >
                <DownloadIcon />
                Download recording
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            data-testid="recorder-input-toggle"
            disabled={inputToggleDisabled}
            onClick={onInputToggle}
            className={
              inputActive
                ? "size-7 border-red-600 bg-red-700 text-white hover:bg-red-600"
                : "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
            }
            title={inputActive ? "Disable input" : "Enable input"}
            aria-label={inputActive ? "Disable input" : "Enable input"}
            aria-pressed={inputActive}
          >
            R
          </Button>
          <Button
            onClick={() => onMutedChange(!muted)}
            className={mixToggleClass(muted)}
            title={muted ? "Unmute Capture" : "Mute Capture"}
          >
            M
          </Button>
          <Button
            onClick={() => onSoloedChange(!soloed)}
            className={mixToggleClass(soloed)}
            title={soloed ? "Disable Capture solo" : "Solo Capture"}
          >
            S
          </Button>
        </div>
        <button
          type="button"
          onClick={onInputSetup}
          className={cn(
            "col-span-2 min-w-0 truncate text-left text-[11px] hover:underline",
            routeNeedsSetup
              ? "font-medium text-orange-300 hover:text-orange-200"
              : "text-neutral-400 hover:text-neutral-100",
          )}
        >
          {route}
        </button>
        <div className="col-span-2">
          <InputMeter active={inputActive} analyser={inputAnalyser} compact />
        </div>
        <label className="col-span-2 grid grid-cols-[1fr_3.5rem] items-end gap-2 text-[10px] text-neutral-400">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-500/70"
              style={{ left: `${dbToPercent(0)}%` }}
            />
            <input
              aria-label="Capture gain"
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
        className="absolute inset-x-0 bottom-0 z-30 h-px cursor-ns-resize border-b border-neutral-700 after:absolute after:inset-x-0 after:-top-1 after:h-2"
        title="Resize Capture"
      />
    </div>
  );
}

type RecorderTimelineClip = {
  label: string;
  /** Visible clip length on the timeline, in seconds. */
  duration: number;
  /** Absolute timeline position where the visible clip begins. */
  offset: number;
  /** Complete source-buffer length, used to render a trimmed waveform. */
  audioDuration?: number;
  /** Visible clip start relative to the source buffer, in seconds. */
  audioOffset?: number;
  variant: "audio" | "take" | "recording";
  audioView?: AudioView;
};

function TakeTimelineLane({
  takes,
  pendingRecording,
  captureStatus,
  isTakeSelected,
  beatsPerBar,
  subdivisionsPerBeat,
  pixelsPerBeat,
  tempo,
  viewportStartBeat,
  viewportWidth,
  onSeek,
  onTakeDragStart,
  onTakeClick,
  onTakeDragMove,
  onTakeTrimStartChange,
  onTakeTrimEndChange,
}: {
  takes: RecorderRuntimeState["recordingTrack"]["takes"];
  pendingRecording: RecorderRuntimeState["pendingRecording"];
  captureStatus: RecorderRuntimeState["captureStatus"];
  isTakeSelected: (id: string) => boolean;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  pixelsPerBeat: number;
  tempo: number;
  viewportStartBeat: number;
  viewportWidth: number;
  onSeek: (position: number) => void;
  onTakeDragStart: (id: string, additive: boolean) => RecorderClipMoveSnapshot;
  onTakeClick: (id: string, additive: boolean) => void;
  onTakeDragMove: (clips: RecorderClipMoveSnapshot, delta: number) => void;
  onTakeTrimStartChange: (id: string, trimStart: number) => void;
  onTakeTrimEndChange: (id: string, trimEnd: number) => void;
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
      {takes.length === 0 && !pendingRecording && (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          Enable input, place the playhead, then record
        </div>
      )}
      {takes.map((take) => (
        <div key={take.id}>
          <TimelineClip
            clip={{
              label: `Take ${take.number}`,
              duration: take.trimEnd - take.trimStart,
              offset: take.timelineOffset + take.trimStart,
              audioDuration: take.duration,
              audioOffset: take.trimStart,
              variant: "take",
              audioView: take.audioView,
            }}
            pixelsPerBeat={pixelsPerBeat}
            viewportStartBeat={viewportStartBeat}
            tempo={tempo}
            viewportWidth={viewportWidth}
            onClipDragStart={(additive) => onTakeDragStart(take.id, additive)}
            onClipClick={(additive) => onTakeClick(take.id, additive)}
            onClipDragMove={onTakeDragMove}
            onTrimStartChange={(trimStart) =>
              onTakeTrimStartChange(take.id, trimStart)
            }
            onTrimEndChange={(trimEnd) => onTakeTrimEndChange(take.id, trimEnd)}
            trimStart={take.trimStart}
            trimEnd={take.trimEnd}
            selected={isTakeSelected(take.id)}
          />
        </div>
      ))}
      {pendingRecording && (
        <div>
          <TimelineClip
            clip={{
              duration: pendingRecording.duration,
              label:
                captureStatus === "processing"
                  ? "Finalizing..."
                  : "Recording...",
              offset: pendingRecording.timelineOffset,
              variant: "recording",
            }}
            pixelsPerBeat={pixelsPerBeat}
            viewportStartBeat={viewportStartBeat}
            tempo={tempo}
            viewportWidth={viewportWidth}
          />
        </div>
      )}
    </div>
  );
}

function TimelineLane({
  beatsPerBar,
  clip,
  emptyLabel,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  selected,
  onClipDragStart,
  onClipClick,
  onClipDragMove,
  onTrimStartChange,
  onTrimEndChange,
  trimStart,
  trimEnd,
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
  selected: boolean;
  onClipDragStart: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipClick: (additive: boolean) => void;
  onClipDragMove: (clips: RecorderClipMoveSnapshot, delta: number) => void;
  onTrimStartChange?: (offset: number) => void;
  onTrimEndChange?: (offset: number) => void;
  trimStart?: number;
  trimEnd?: number;
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
          selected={selected}
          onClipDragStart={onClipDragStart}
          onClipClick={onClipClick}
          onClipDragMove={onClipDragMove}
          onTrimStartChange={onTrimStartChange}
          onTrimEndChange={onTrimEndChange}
          trimStart={trimStart}
          trimEnd={trimEnd}
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
  onClipDragStart,
  onClipClick,
  onClipDragMove,
  onTrimStartChange,
  onTrimEndChange,
  trimStart,
  trimEnd,
  selected = false,
}: {
  clip: RecorderTimelineClip;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  onClipDragStart?: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipClick?: (additive: boolean) => void;
  onClipDragMove?: (clips: RecorderClipMoveSnapshot, delta: number) => void;
  onTrimStartChange?: (offset: number) => void;
  onTrimEndChange?: (offset: number) => void;
  trimStart?: number;
  trimEnd?: number;
  selected?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        additive: event.ctrlKey || event.metaKey,
        clips: [] as RecorderClipMoveSnapshot,
      };
    },
    onClick: (_event, { data }) => {
      onClipClick?.(data.additive);
    },
    onDragStart: (_event, { data }) => {
      setIsDragging(true);
      data.clips = onClipDragStart?.(data.additive) ?? [];
    },
    onDragMove: (_event, { data, deltaX }) => {
      onClipDragMove!(
        data.clips,
        beatsToSeconds(deltaX / pixelsPerBeat, tempo),
      );
    },
    onDragEnd: () => {
      setIsDragging(false);
    },
    onCancel: () => {
      setIsDragging(false);
    },
  });
  const trimStartRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        startClientX: event.clientX,
        initialValue: trimStart!,
      };
    },
    onMove: (event, drag) => {
      const delta = beatsToSeconds(
        (event.clientX - drag.startClientX) / pixelsPerBeat,
        tempo,
      );
      onTrimStartChange!(drag.initialValue + delta);
    },
  });
  const trimEndRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        startClientX: event.clientX,
        initialValue: trimEnd!,
      };
    },
    onMove: (event, drag) => {
      const delta = beatsToSeconds(
        (event.clientX - drag.startClientX) / pixelsPerBeat,
        tempo,
      );
      onTrimEndChange!(drag.initialValue + delta);
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
    (clip.audioOffset ?? 0) +
      beatsToSeconds(viewportStartBeat - clipStartBeat, tempo),
  );
  const visibleEnd = Math.min(
    (clip.audioOffset ?? 0) + clip.duration,
    (clip.audioOffset ?? 0) +
      beatsToSeconds(
        viewportStartBeat + viewportWidth / pixelsPerBeat - clipStartBeat,
        tempo,
      ),
  );
  return (
    <div
      data-testid={`recorder-clip-${clip.variant}`}
      data-selected={selected ? "true" : undefined}
      ref={onClipDragMove ? dragRef : undefined}
      className={cn(
        "absolute inset-y-1 rounded-sm border text-[11px]",
        clipClass,
        onClipDragMove && "cursor-ew-resize select-none",
        onClipDragStart && "cursor-pointer",
        selected && "border-sky-300 ring-1 ring-inset ring-sky-300",
        isDragging && "brightness-125",
      )}
      style={{
        left: (clipStartBeat - viewportStartBeat) * pixelsPerBeat,
        width: clipWidth,
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {clip.audioView && visibleEnd > visibleStart && (
          <AudioWaveformView
            audioView={clip.audioView}
            audioDuration={clip.audioDuration ?? clip.duration}
            rangeStart={clip.audioOffset ?? 0}
            rangeEnd={(clip.audioOffset ?? 0) + clip.duration}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            pixelWidth={clipWidth}
          />
        )}
        <div className="absolute left-1 top-0.5 z-10 whitespace-nowrap">
          <span className="mr-1.5">{clip.label}</span>
          {onClipDragMove && clip.offset > 0 && (
            <span className="opacity-75">+{clip.offset.toFixed(3)}s</span>
          )}
        </div>
      </div>
      {onTrimStartChange && (
        <div
          ref={trimStartRef}
          data-testid="recorder-take-trim-start"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-y-0 -left-[3px] z-20 w-1.5 cursor-ew-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-transparent hover:after:bg-white/50"
        />
      )}
      {onTrimEndChange && (
        <div
          ref={trimEndRef}
          data-testid="recorder-take-trim-end"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-y-0 -right-[3px] z-20 w-1.5 cursor-ew-resize after:absolute after:inset-y-0 after:right-[3px] after:w-0.5 after:bg-transparent hover:after:bg-white/50"
        />
      )}
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

function InputSetup({
  devices,
  error,
  hasAccess,
  inputActive,
  inputAnalyser,
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
  inputAnalyser?: AudioAnalyser;
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
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="space-y-4">
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
            <InputMeter active={inputActive} analyser={inputAnalyser} />
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
        <div className="mt-4 border border-orange-700/60 bg-orange-950/40 p-3 text-xs text-orange-200">
          {error.message}
        </div>
      )}
    </div>
  );
}
