import { useMutation } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { useWindowEvent } from "../../hooks/use-window-event";
import { resolveAudioFiles } from "../../lib/audio-files";
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import { exportRecorderProjectArchive } from "../../lib/recorder/project-archive";
import { RecorderRuntime } from "../../lib/recorder/runtime";
import { formatTimeWithMilliseconds } from "../../lib/time-format";
import { encodeWav } from "../../lib/wav";
import { parseTimeSignature } from "../../types";
import { Dialog } from "../ui/dialog";
import { FloatingPanel } from "../ui/floating-panel";
import { RecorderHeader } from "./recorder-header";
import { InputSetup } from "./recorder-input";
import { RecorderMixer } from "./recorder-mixer";
import {
  TakeTimelineLane,
  ReferenceTimelineRow,
  TimelineHeader,
  TimelineLane,
} from "./recorder-timeline";
import {
  AudioTrackActions,
  CaptureTrackRow,
  TakesDisclosureRow,
  TakeTrackRow,
  TrackRow,
} from "./recorder-tracks";
import { ReferenceVideoPanel } from "./reference-video";
import { useRecorderClipInteraction } from "./use-recorder-clip-interaction";
import { useRecorderInput } from "./use-recorder-input";
import { useRecorderProject } from "./use-recorder-project";
import { useRecorderTimeline } from "./use-recorder-timeline";

export function Recorder({ projectId }: { projectId: string }) {
  const [runtime] = useState(() => new RecorderRuntime());
  const [isInputSetupOpen, setIsInputSetupOpen] = useState(false);
  const [isReferenceVideoOpen, setIsReferenceVideoOpen] = useState(false);
  const [takesExpanded, setTakesExpanded] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
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
  const exportProjectMutation = useMutation({
    mutationFn: async () => {
      const blob = await exportRecorderProjectArchive(
        runtime.serializeProject(),
      );
      downloadBlob(
        blob,
        buildExportFileName({
          baseName: state.title,
          extension: ".toymidi.zip",
        }),
      );
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
    if (isShortcutTextInputTarget(event.target)) {
      return;
    }
    const seekDirection = matchKeyboardEvent(event, "ArrowLeft")
      ? -1
      : matchKeyboardEvent(event, "ArrowRight")
        ? 1
        : 0;
    if (seekDirection !== 0 && !isRecording && !isProcessing) {
      event.preventDefault();
      const position = Math.max(0, state.position + seekDirection * 5);
      runtime.seek(position);
      timeline.revealPosition(position);
      return;
    }
    if (event.repeat) {
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
        referenceVideoOpen={isReferenceVideoOpen}
        isPlaying={state.isPlaying}
        isProcessing={isProcessing}
        isRecording={isRecording}
        isExporting={exportProjectMutation.isPending}
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
        onExportProject={() => exportProjectMutation.mutate()}
        onReferenceVideoOpenChange={setIsReferenceVideoOpen}
        mixerOpen={isMixerOpen}
        onMixerToggle={() => setIsMixerOpen((open) => !open)}
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
            {state.referenceVideo && (
              <ReferenceTimelineRow
                referenceVideo={state.referenceVideo}
                position={state.position}
                pixelsPerBeat={timeline.pixelsPerBeat}
                beatsPerBar={timeline.beatsPerBar}
                subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                viewportStartBeat={timeline.viewportStartBeat}
                tempo={timeline.tempo}
                viewportWidth={timeline.viewportWidth}
                onSeek={(position) => runtime.seek(position)}
                selected={clipInteraction.isSelected({ type: "reference" })}
                onClipClick={(additive) =>
                  clipInteraction.select({ type: "reference" }, additive)
                }
                onClipDragStart={(additive) =>
                  clipInteraction.startMove({
                    clip: { type: "reference" },
                    additive,
                  })
                }
                onClipDragMove={clipInteraction.move}
                muted={state.referenceVideo.muted}
                onMutedChange={(muted) => runtime.setReferenceVideoMuted(muted)}
                onRemove={() => runtime.removeReferenceVideo()}
              />
            )}
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
                          testId: "audio",
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
                  onTrimStart={(edge) =>
                    clipInteraction.startTrim({
                      clip: { type: "audio", id: track.id },
                      edge,
                    })
                  }
                  onTrimMove={clipInteraction.trim}
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
                regions={state.previewTakeRegions ?? state.takeRegions}
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
                onTakeTrimStart={(id, edge) =>
                  clipInteraction.startTrim({
                    clip: { type: "take", id },
                    edge,
                  })
                }
                onTakeTrimMove={clipInteraction.trim}
              />
            </CaptureTrackRow>
            <TakesDisclosureRow
              expanded={takesExpanded}
              takeCount={takes.length}
              onExpandedChange={setTakesExpanded}
            />
            {takesExpanded &&
              takes.map((take) => (
                <TakeTrackRow
                  key={take.id}
                  number={take.number}
                  muted={take.muted}
                  soloed={take.soloed}
                  onMutedChange={(muted) =>
                    runtime.setTakeMuted(take.id, muted)
                  }
                  onSoloedChange={(soloed) =>
                    runtime.setTakeSoloed(take.id, soloed)
                  }
                  onDelete={() =>
                    runtime.removeClips([{ type: "take", id: take.id }])
                  }
                >
                  <TimelineLane
                    clip={{
                      label: `Take ${take.number}`,
                      duration: take.trimEnd - take.trimStart,
                      offset: take.timelineOffset + take.trimStart,
                      testId: "take-lane",
                      audioView: take.audioView,
                      audioDuration: take.duration,
                      audioOffset: take.trimStart,
                    }}
                    pixelsPerBeat={timeline.pixelsPerBeat}
                    beatsPerBar={timeline.beatsPerBar}
                    subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                    viewportStartBeat={timeline.viewportStartBeat}
                    tempo={timeline.tempo}
                    viewportWidth={timeline.viewportWidth}
                    emptyLabel=""
                    selected={clipInteraction.isSelected({
                      type: "take",
                      id: take.id,
                    })}
                    onClipClick={(additive) =>
                      clipInteraction.select(
                        { type: "take", id: take.id },
                        additive,
                      )
                    }
                    onTrimStart={(edge) =>
                      clipInteraction.startTrim({
                        clip: { type: "take", id: take.id },
                        edge,
                      })
                    }
                    onTrimMove={clipInteraction.trim}
                    onClipDragStart={(additive) =>
                      clipInteraction.startMove({
                        clip: { type: "take", id: take.id },
                        additive,
                      })
                    }
                    onClipDragMove={clipInteraction.move}
                    onSeek={(position) => {
                      clipInteraction.clear();
                      runtime.seek(position);
                    }}
                  />
                </TakeTrackRow>
              ))}
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
      {isReferenceVideoOpen && (
        <ReferenceVideoPanel
          referenceVideo={state.referenceVideo}
          runtime={runtime}
          onClose={() => setIsReferenceVideoOpen(false)}
        />
      )}
      {isMixerOpen && (
        <FloatingPanel
          closeLabel="Close Mixer"
          onClose={() => setIsMixerOpen(false)}
          title="Mixer"
          testId="recorder-mixer-panel"
          className="max-w-[calc(100vw-2rem)]"
        >
          <RecorderMixer runtime={runtime} state={state} />
        </FloatingPanel>
      )}
    </main>
  );
}
