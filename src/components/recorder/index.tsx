import { useMutation } from "@tanstack/react-query";
import { Mic2Icon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useWindowEvent } from "../../hooks/use-window-event";
import { resolveAudioFiles } from "../../lib/audio-files";
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import { exportRecorderProjectArchive } from "../../lib/recorder/project-archive";
import { RecorderRuntime } from "../../lib/recorder/runtime";
import { routes } from "../../lib/routes";
import { beatsToSeconds } from "../../lib/timeline";
import { parseTimeSignature } from "../../types";
import { Dialog } from "../ui/dialog";
import { RecorderHelp } from "./help";
import { RecorderEffects, useRecorderEffectsUi } from "./recorder-effects";
import { RecorderExportDialog } from "./recorder-export-dialog";
import { deriveRecorderFlags } from "./recorder-flags";
import { RecorderHeader } from "./recorder-header";
import { InputSetup } from "./recorder-input";
import { RecorderLocatorRow, useRecorderLocators } from "./recorder-locators";
import { RecorderMixer } from "./recorder-mixer";
import { RecorderPanel } from "./recorder-panel";
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
  const effects = useRecorderEffectsUi();
  const [isAudioExportOpen, setIsAudioExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
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
    onSelect: () => {
      locators.select(undefined);
    },
  });
  const locators = useRecorderLocators({
    runtime,
    state,
    subdivisionsPerBeat: timeline.subdivisionsPerBeat,
    onSelect: clipInteraction.clear,
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

  const recordingTrack = state.audioTracks.find(
    (track) => track.id === state.armedTrackId,
  )!;
  const audioTracks = state.audioTracks.filter(
    (track) => track.id !== state.armedTrackId,
  );
  const takes = recordingTrack.clips;
  const flags = deriveRecorderFlags({
    captureStatus: state.captureStatus,
    project,
  });

  function togglePlay() {
    if (flags.playDisabled) {
      return;
    }
    if (flags.isRecording) {
      recordMutation.mutate("stop");
    } else if (state.isPlaying) {
      runtime.pause();
    } else {
      playMutation.mutate();
    }
  }

  function toggleRecord() {
    if (flags.recordDisabled) {
      return;
    }
    recordMutation.mutate(flags.isRecording ? "stop" : "start");
  }

  useWindowEvent("keydown", (event) => {
    if (project.initError) {
      return;
    }
    if (isHelpOpen) {
      if (!event.repeat && matchKeyboardEvent(event, "Escape")) {
        event.preventDefault();
        setIsHelpOpen(false);
      }
      if (matchKeyboardEvent(event, "Ctrl+S")) {
        event.preventDefault();
      }
      return;
    }
    if (isAudioExportOpen) {
      return;
    }
    if (matchKeyboardEvent(event, "Ctrl+S") && !event.repeat) {
      event.preventDefault();
      if (!flags.saveDisabled) {
        project.save();
      }
      return;
    }
    if (isShortcutTextInputTarget(event.target) || event.repeat) {
      return;
    }
    if (matchKeyboardEvent(event, "L")) {
      event.preventDefault();
      locators.add();
      return;
    }
    if (
      locators.selectedId &&
      (matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace"))
    ) {
      event.preventDefault();
      locators.removeSelected();
      return;
    }
    if (matchKeyboardEvent(event, "Escape")) {
      locators.select(undefined);
    }
    const seekDirection = matchKeyboardEvent(event, "ArrowLeft")
      ? -1
      : matchKeyboardEvent(event, "ArrowRight")
        ? 1
        : 0;
    if (seekDirection !== 0 && !flags.isRecording) {
      event.preventDefault();
      const position = Math.max(0, state.position + seekDirection * 5);
      runtime.seek(position);
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
    <main
      inert={project.initError !== undefined}
      className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100"
    >
      <RecorderHeader
        title={project.ready ? state.title : undefined}
        saveStatus={project.saveStatus}
        referenceVideoOpen={isReferenceVideoOpen}
        isPlaying={state.isPlaying}
        flags={flags}
        isExporting={exportProjectMutation.isPending}
        autoScrollEnabled={timeline.autoScrollEnabled}
        metronomeEnabled={state.metronomeEnabled}
        masterGain={state.masterGain}
        loop={state.loop}
        punch={state.punch}
        position={state.position}
        playbackRate={state.playbackRate}
        tempo={timeline.tempo}
        timeSignature={timeline.timeSignature}
        gridDivision={timeline.gridDivision}
        onPlayToggle={togglePlay}
        onTitleChange={(nextTitle) => {
          runtime.setTitle(nextTitle);
        }}
        onSave={project.save}
        onRecordToggle={toggleRecord}
        onAutoScrollChange={timeline.setAutoScrollEnabled}
        onPlaybackRateChange={(playbackRate) => {
          runtime.setPlaybackRate(playbackRate);
        }}
        onTempoChange={(tempo) => runtime.setTempo(tempo)}
        onMetronomeChange={(enabled) => runtime.setMetronomeEnabled(enabled)}
        onMasterGainChange={(gain) => runtime.setMasterGain(gain)}
        onLoopChange={(update) => runtime.setLoop(update)}
        onPunchChange={(update) => runtime.setPunch(update)}
        onTimeSignatureChange={(timeSignature) =>
          runtime.setTimeSignature(parseTimeSignature(timeSignature))
        }
        onGridDivisionChange={timeline.setGridDivision}
        onExportProject={() => exportProjectMutation.mutate()}
        onExportAudio={() => setIsAudioExportOpen(true)}
        onReferenceVideoOpenChange={setIsReferenceVideoOpen}
        mixerOpen={isMixerOpen}
        onMixerToggle={() => setIsMixerOpen((open) => !open)}
        onHelpOpen={() => setIsHelpOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <RecorderLocatorRow
          locators={locators}
          pixelsPerBeat={timeline.pixelsPerBeat}
          viewportStartBeat={timeline.viewportStartBeat}
          subdivisionsPerBeat={timeline.subdivisionsPerBeat}
          onSeekBeat={(beat) =>
            runtime.seek(beatsToSeconds(beat, timeline.tempo))
          }
        />
        <section
          data-testid="recorder-track-scroll"
          className="relative isolate min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div
            ref={timeline.viewportRef}
            className="pointer-events-none absolute inset-y-0 left-[15rem] right-0"
          />
          <div className="relative">
            {timeline.showPlayhead && (
              <div className="pointer-events-none absolute inset-y-0 left-[15rem] right-0 z-50 overflow-hidden">
                <div
                  data-testid="recorder-playhead"
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
              loop={state.loop}
              punch={state.punch}
              onLoopRangeChange={(range) => runtime.setLoop({ range })}
              onLoopRangeClear={() =>
                runtime.setLoop({ range: undefined, enabled: false })
              }
              onPunchRangeChange={(range) => runtime.setPunch({ range })}
              onPunchRangeClear={() =>
                runtime.setPunch({ range: undefined, enabled: false })
              }
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
            {audioTracks.map((track, index) => {
              const region = track.regions[0];
              const clip = region?.clip;
              return (
                <TrackRow
                  key={track.id}
                  title={`Audio ${index + 1}`}
                  height={track.height}
                  gain={track.gain}
                  muted={track.muted}
                  soloed={track.soloed}
                  effectsOpen={effects.openEffects.has(track.id)}
                  onEffectsToggle={() => effects.toggleEffects(track.id)}
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
                      onRemove={() => {
                        runtime.removeAudioTrack(track.id);
                        effects.closeEffects(track.id);
                      }}
                    />
                  }
                >
                  <TimelineLane
                    clip={
                      region && clip
                        ? {
                            duration: region.timelineEnd - region.timelineStart,
                            label: clip.name,
                            offset: region.timelineStart,
                            testId: "audio",
                            audioView: clip.audioView,
                            audioOffset:
                              region.timelineStart - clip.timelineOffset,
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
                    selected={
                      clip !== undefined &&
                      clipInteraction.isSelected({
                        type: "audio",
                        trackId: track.id,
                        id: clip.id,
                      })
                    }
                    onClipClick={(additive) =>
                      clipInteraction.select(
                        { type: "audio", trackId: track.id, id: clip!.id },
                        additive,
                      )
                    }
                    onTrimStart={(edge) =>
                      clipInteraction.startTrim({
                        clip: {
                          type: "audio",
                          trackId: track.id,
                          id: clip!.id,
                        },
                        edge,
                      })
                    }
                    onTrimMove={clipInteraction.trim}
                    onClipDragStart={(additive) =>
                      clipInteraction.startMove({
                        clip: {
                          type: "audio",
                          trackId: track.id,
                          id: clip!.id,
                        },
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
              );
            })}

            <CaptureTrackRow
              route={input.route.label}
              routeNeedsSetup={input.route.needsSetup}
              gain={recordingTrack.gain}
              height={recordingTrack.height}
              inputActive={input.active}
              inputAnalyser={runtime.captureInput?.analyser}
              inputMonitoring={state.inputMonitoring}
              inputToggleDisabled={
                input.mutationPending ||
                !input.initialized ||
                flags.isRecording ||
                (!input.active && input.route.needsSetup)
              }
              muted={recordingTrack.muted}
              soloed={recordingTrack.soloed}
              effectsOpen={effects.openEffects.has("capture")}
              onEffectsToggle={() => effects.toggleEffects("capture")}
              onGainChange={(gain) =>
                runtime.setAudioTrackMix(recordingTrack.id, { gain })
              }
              onInputSetup={() => setIsInputSetupOpen(true)}
              onInputMonitoringChange={(monitoring) =>
                runtime.setInputMonitoring(monitoring)
              }
              onInputToggle={input.toggle}
              onMutedChange={(muted) =>
                runtime.setAudioTrackMix(recordingTrack.id, { muted })
              }
              onSoloedChange={(soloed) =>
                runtime.setAudioTrackMix(recordingTrack.id, { soloed })
              }
              onHeightChange={(height) =>
                runtime.setAudioTrackHeight(recordingTrack.id, height)
              }
            >
              <TakeTimelineLane
                takes={takes}
                regions={state.previewClipRegions ?? recordingTrack.regions}
                pendingRecording={state.pendingRecording}
                captureStatus={state.captureStatus}
                isTakeSelected={(id) =>
                  clipInteraction.isSelected({
                    type: "audio",
                    trackId: recordingTrack.id,
                    id,
                  })
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
                    clip: { type: "audio", trackId: recordingTrack.id, id },
                    additive,
                  })
                }
                onTakeClick={(id, additive) =>
                  clipInteraction.select(
                    { type: "audio", trackId: recordingTrack.id, id },
                    additive,
                  )
                }
                onTakeDragMove={clipInteraction.move}
                onTakeTrimStart={(id, edge) =>
                  clipInteraction.startTrim({
                    clip: { type: "audio", trackId: recordingTrack.id, id },
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
                  label={take.name}
                  muted={take.muted}
                  soloed={take.soloed}
                  onMutedChange={(muted) =>
                    runtime.setClipMuted({
                      trackId: recordingTrack.id,
                      id: take.id,
                      muted,
                    })
                  }
                  onSoloedChange={(soloed) =>
                    runtime.setClipSoloed({
                      trackId: recordingTrack.id,
                      id: take.id,
                      soloed,
                    })
                  }
                  onDelete={() =>
                    runtime.removeClips([
                      {
                        type: "audio",
                        trackId: recordingTrack.id,
                        id: take.id,
                      },
                    ])
                  }
                >
                  <TimelineLane
                    clip={{
                      label: take.name,
                      duration: take.trimEnd - take.trimStart,
                      offset: take.timelineOffset + take.trimStart,
                      testId: "take-lane",
                      audioView: take.audioView,
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
                      type: "audio",
                      trackId: recordingTrack.id,
                      id: take.id,
                    })}
                    onClipClick={(additive) =>
                      clipInteraction.select(
                        {
                          type: "audio",
                          trackId: recordingTrack.id,
                          id: take.id,
                        },
                        additive,
                      )
                    }
                    onTrimStart={(edge) =>
                      clipInteraction.startTrim({
                        clip: {
                          type: "audio",
                          trackId: recordingTrack.id,
                          id: take.id,
                        },
                        edge,
                      })
                    }
                    onTrimMove={clipInteraction.trim}
                    onClipDragStart={(additive) =>
                      clipInteraction.startMove({
                        clip: {
                          type: "audio",
                          trackId: recordingTrack.id,
                          id: take.id,
                        },
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

        <RecorderHelp
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
        <RecorderExportDialog
          runtime={runtime}
          state={state}
          isOpen={isAudioExportOpen}
          onClose={() => setIsAudioExportOpen(false)}
          disabled={!project.ready || flags.isRecording}
        />
        <Dialog
          isOpen={isInputSetupOpen}
          onClose={() => setIsInputSetupOpen(false)}
          title="Audio Input Setup"
          data-testid="recorder-input-setup"
        >
          <InputSetup
            devices={input.devices}
            error={input.error}
            hasAccess={input.hasAccess}
            inputActive={input.active}
            inputAnalyser={runtime.captureInput?.analyser}
            inputsInitialized={input.initialized}
            isRecording={flags.isRecording}
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
      <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex max-w-[calc(100vw-2rem)] items-end gap-4">
        {effects.openEffects.size > 0 && (
          <div className="pointer-events-auto flex min-w-0 gap-4 overflow-x-auto">
            {audioTracks.map(
              (track, index) =>
                effects.openEffects.has(track.id) && (
                  <RecorderEffects
                    key={track.id}
                    label={`Audio ${index + 1}`}
                    eq={track.eq}
                    onChange={(eq) =>
                      runtime.setAudioTrackEq({ id: track.id, eq })
                    }
                    onClose={() => effects.closeEffects(track.id)}
                  />
                ),
            )}
            {effects.openEffects.has("capture") && (
              <RecorderEffects
                label="Capture"
                eq={recordingTrack.eq}
                onChange={(eq) =>
                  runtime.setAudioTrackEq({ id: recordingTrack.id, eq })
                }
                onClose={() => effects.closeEffects("capture")}
              />
            )}
          </div>
        )}
        {isMixerOpen && (
          <RecorderPanel
            closeLabel="Close Mixer"
            onClose={() => setIsMixerOpen(false)}
            title="Mixer"
            data-testid="recorder-mixer-panel"
            className="pointer-events-auto min-w-80 flex-1"
          >
            <RecorderMixer
              runtime={runtime}
              state={state}
              openEffects={effects.openEffects}
              onEffectsToggle={effects.toggleEffects}
            />
          </RecorderPanel>
        )}
        {isReferenceVideoOpen && (
          <ReferenceVideoPanel
            referenceVideo={state.referenceVideo}
            runtime={runtime}
            onClose={() => setIsReferenceVideoOpen(false)}
          />
        )}
      </div>
      {project.initError &&
        createPortal(
          <RecorderInitError error={project.initError} />,
          document.body,
        )}
    </main>
  );
}

// Rendered outside the inert editor so the notice stays interactive while
// everything beneath it is blocked from pointer and keyboard access.
function RecorderInitError({ error }: { error: Error }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recorder-init-error-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4 text-neutral-100"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800 p-6 text-center shadow-2xl">
        <Mic2Icon className="size-6 text-emerald-400" />
        <div className="flex flex-col gap-1">
          <h1 id="recorder-init-error-title" className="text-lg font-medium">
            Could not open this project
          </h1>
          <p className="text-sm text-neutral-400">{error.message}</p>
        </div>
        <a
          href={routes.home.href()}
          className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          Back to projects
        </a>
      </div>
    </div>
  );
}
