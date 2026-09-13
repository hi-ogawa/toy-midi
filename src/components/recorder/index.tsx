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
  AudioTimelineLane,
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

  const takes = state.recordingTrack.clips;
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
    if (flags.recordDisabled || recordMutation.isPending) {
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
    if (input.isSetupOpen) {
      if (matchKeyboardEvent(event, "Escape")) {
        event.preventDefault();
        input.closeSetup();
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
        inputAccessRequired={input.initialized && !input.hasAccess}
        inputPending={input.mutationPending}
        onInputSetup={input.openSetup}
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
            {state.audioTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                title={`Audio ${index + 1}`}
                height={track.height}
                gain={track.gain}
                muted={track.muted}
                soloed={track.soloed}
                effectsOpen={effects.openEffects.has(track.id)}
                onEffectsToggle={() => effects.toggleEffects(track.id)}
                onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
                onMutedChange={(muted) =>
                  runtime.setTrackMix(track.id, { muted })
                }
                onSoloedChange={(soloed) =>
                  runtime.setTrackMix(track.id, { soloed })
                }
                onHeightChange={(height) =>
                  runtime.setTrackHeight(track.id, height)
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
                <AudioTimelineLane
                  clips={track.clips}
                  regions={track.regions}
                  testId="audio"
                  pixelsPerBeat={timeline.pixelsPerBeat}
                  beatsPerBar={timeline.beatsPerBar}
                  subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                  viewportStartBeat={timeline.viewportStartBeat}
                  tempo={timeline.tempo}
                  viewportWidth={timeline.viewportWidth}
                  emptyLabel="Load an audio file"
                  isClipSelected={(id) =>
                    clipInteraction.isSelected({ type: "clip", id })
                  }
                  onClipClick={(id, additive) =>
                    clipInteraction.select({ type: "clip", id }, additive)
                  }
                  onTrimStart={(id, edge) =>
                    clipInteraction.startTrim({
                      clip: { type: "clip", id },
                      edge,
                    })
                  }
                  onTrimMove={clipInteraction.trim}
                  onClipDragStart={(id, additive) =>
                    clipInteraction.startMove({
                      clip: { type: "clip", id },
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
              gain={state.recordingTrack.gain}
              height={state.recordingTrack.height}
              inputActive={input.active}
              inputAnalyser={runtime.captureInput?.analyser}
              inputMonitoring={state.inputMonitoring}
              inputToggleDisabled={
                !input.initialized ||
                (!input.active && input.route.needsSetup) ||
                input.mutationPending ||
                flags.isRecording ||
                recordMutation.isPending
              }
              muted={state.recordingTrack.muted}
              soloed={state.recordingTrack.soloed}
              effectsOpen={effects.openEffects.has("capture")}
              onEffectsToggle={() => effects.toggleEffects("capture")}
              onGainChange={(gain) =>
                runtime.setTrackMix(state.recordingTrack.id, { gain })
              }
              onInputSetup={input.openSetup}
              onInputMonitoringChange={(monitoring) =>
                runtime.setInputMonitoring(monitoring)
              }
              onInputToggle={input.toggle}
              onMutedChange={(muted) =>
                runtime.setTrackMix(state.recordingTrack.id, { muted })
              }
              onSoloedChange={(soloed) =>
                runtime.setTrackMix(state.recordingTrack.id, { soloed })
              }
              onHeightChange={(height) =>
                runtime.setTrackHeight(state.recordingTrack.id, height)
              }
            >
              <TakeTimelineLane
                takes={takes}
                regions={
                  state.previewClipRegions ?? state.recordingTrack.regions
                }
                pendingRecording={state.pendingRecording}
                captureStatus={state.captureStatus}
                isTakeSelected={(id) =>
                  clipInteraction.isSelected({ type: "clip", id })
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
                    clip: { type: "clip", id },
                    additive,
                  })
                }
                onTakeClick={(id, additive) =>
                  clipInteraction.select({ type: "clip", id }, additive)
                }
                onTakeDragMove={clipInteraction.move}
                onTakeTrimStart={(id, edge) =>
                  clipInteraction.startTrim({
                    clip: { type: "clip", id },
                    edge,
                  })
                }
                onTakeTrimMove={clipInteraction.trim}
              />
            </CaptureTrackRow>
            {takes.length > 0 && (
              <TakesDisclosureRow
                expanded={takesExpanded}
                takeCount={takes.length}
                onExpandedChange={setTakesExpanded}
              />
            )}
            {takes.length > 0 &&
              takesExpanded &&
              takes.map((take) => (
                <TakeTrackRow
                  key={take.id}
                  label={take.name}
                  muted={take.muted}
                  soloed={take.soloed}
                  onMutedChange={(muted) =>
                    runtime.setClipMuted({ id: take.id, muted })
                  }
                  onSoloedChange={(soloed) =>
                    runtime.setClipSoloed({ id: take.id, soloed })
                  }
                  onDelete={() =>
                    runtime.removeClips([{ type: "clip", id: take.id }])
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
                      type: "clip",
                      id: take.id,
                    })}
                    onClipClick={(additive) =>
                      clipInteraction.select(
                        { type: "clip", id: take.id },
                        additive,
                      )
                    }
                    onTrimStart={(edge) =>
                      clipInteraction.startTrim({
                        clip: { type: "clip", id: take.id },
                        edge,
                      })
                    }
                    onTrimMove={clipInteraction.trim}
                    onClipDragStart={(additive) =>
                      clipInteraction.startMove({
                        clip: { type: "clip", id: take.id },
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
          isOpen={input.isSetupOpen}
          onClose={input.closeSetup}
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
            isRecording={flags.isRecording || recordMutation.isPending}
            selectedDevice={input.selectedDevice}
            selectedChannel={state.selectedChannel}
            inputChannelCount={state.inputChannelCount}
            latencyCompensation={state.latencyCompensation}
            inputTogglePending={input.togglePending}
            mutationPending={input.mutationPending}
            onDeviceChange={input.selectDevice}
            onInputToggle={input.hasAccess ? input.toggle : input.grantAccess}
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
          <div className="pointer-events-auto flex min-w-0 items-end gap-4 overflow-x-auto">
            {state.audioTracks.map(
              (track, index) =>
                effects.openEffects.has(track.id) && (
                  <RecorderEffects
                    key={track.id}
                    label={`Audio ${index + 1}`}
                    eq={track.eq}
                    onChange={(eq) => runtime.setTrackEq({ id: track.id, eq })}
                    onClose={() => effects.closeEffects(track.id)}
                  />
                ),
            )}
            {effects.openEffects.has("capture") && (
              <RecorderEffects
                label="Capture"
                eq={state.recordingTrack.eq}
                onChange={(eq) =>
                  runtime.setTrackEq({ id: state.recordingTrack.id, eq })
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
