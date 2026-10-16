import { useMutation } from "@tanstack/react-query";
import { Mic2Icon } from "lucide-react";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { resolveAudioFiles } from "../lib/audio-files";
import { deriveClipRegions } from "../lib/clip-regions";
import { buildExportFileName, downloadBlob } from "../lib/export-utils";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { snapToGrid } from "../lib/music";
import { getNextPlaybackRate } from "../lib/playback-rate";
import { createProjectUiStore, preferences } from "../lib/preferences";
import { exportProjectArchive } from "../lib/project-archive";
import { createShareLink } from "../lib/project-share";
import { getScoreHref, type ProjectSource, routes } from "../lib/routes";
import { EditorRuntime, REFERENCE_VIDEO_CLIP_ID } from "../lib/runtime";
import { beatsToSeconds, secondsToBeats } from "../lib/timeline";
import { resolveTrackOrder } from "../lib/track-order";
import { parseTimeSignature } from "../types";
import { AudioToMidi, useAudioToMidiUi } from "./audio-to-midi";
import { Effects, useEffectsUi } from "./effects";
import { ExportDialog } from "./export-dialog";
import { deriveEditorFlags } from "./flags";
import { Header } from "./header";
import { Help } from "./help";
import { InputSetup } from "./input";
import { InputPanel } from "./input-panel";
import { LocatorRow } from "./locators";
import { MidiTrackRow } from "./midi-track";
import { Mixer } from "./mixer";
import { Panel } from "./panel";
import { ProjectCommentPanel } from "./project-comment-panel";
import { ReferenceVideoPanel } from "./reference-video";
import { ScorePanel, useScorePanelUi } from "./score-panel";
import {
  ReferenceTimelineRow,
  TimelineHeader,
  TimelinePlayhead,
  AudioTimelineLane,
} from "./timeline";
import {
  type TrackMoveControls,
  AudioTrackActions,
  ClipsDisclosureRow,
  ClipTrackRow,
  TrackRow,
} from "./tracks";
import { Tuner } from "./tuner";
import { Dialog } from "./ui/dialog";
import { useInput } from "./use-input";
import { useInteraction } from "./use-interaction";
import { useProject } from "./use-project";
import { useTimeline } from "./use-timeline";
import { useWebMcpBridge } from "./use-webmcp-bridge";
import { useWindowEvent } from "./use-window-event";

export function Editor({ source }: { source: ProjectSource }) {
  const [runtime] = useState(() => new EditorRuntime());
  useWebMcpBridge(runtime);
  const [projectUiStore] = useState(() => createProjectUiStore(source));
  const [isInputSetupOpen, setIsInputSetupOpen] = useState(false);
  const [isReferenceVideoOpen, setIsReferenceVideoOpen] =
    projectUiStore.useValue("referenceVideoOpen");
  const [expandedClipTracks, setExpandedClipTracks] =
    projectUiStore.useValue("expandedClipTracks");
  const [clipsNewestFirst, setClipsNewestFirst] =
    preferences.useValue("takesNewestFirst");
  const [isMixerOpen, setIsMixerOpen] = projectUiStore.useValue("mixerOpen");
  const [isProjectCommentOpen, setIsProjectCommentOpen] =
    projectUiStore.useValue("projectCommentOpen");
  const [isTunerOpen, setIsTunerOpen] = projectUiStore.useValue("tunerOpen");
  const [isInputPanelOpen, setIsInputPanelOpen] =
    projectUiStore.useValue("inputPanelOpen");
  const effects = useEffectsUi(projectUiStore);
  const [isAudioExportOpen, setIsAudioExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  useEffect(() => {
    document.title = `${state.title} - Toy MIDI`;
  }, [state.title]);

  const input = useInput({
    runtime,
    state,
  });
  const timeline = useTimeline({
    projectUiStore,
    runtime,
    isPlaying: state.isPlaying,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  });
  const project = useProject({ source, runtime, projectUiStore });
  const flags = deriveEditorFlags({ state, project });
  const interaction = useInteraction({
    runtime,
    state,
    isRecording: flags.isRecording,
    subdivisionsPerBeat: timeline.subdivisionsPerBeat,
  });
  const { clipInteraction, locatorInteraction, midiInteraction } = interaction;
  const transcriptions = useAudioToMidiUi();
  const scoreUi = useScorePanelUi();

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
  const importClipMutation = useMutation({
    mutationFn: (input: { trackId: string; file: File }) => {
      return runtime.importAudioClip(input);
    },
  });
  const addAudioMutation = useMutation({
    mutationFn: async (input: File) => {
      const files = await resolveAudioFiles(input);
      for (const file of files) {
        const trackId = runtime.addAudioTrack();
        await runtime.importAudioClip({ trackId, file });
      }
    },
  });
  const addMidiMutation = useMutation({
    mutationFn: () => runtime.addMidiTrack({ program: 0 }),
  });
  const exportProjectMutation = useMutation({
    mutationFn: async () => {
      const blob = await exportProjectArchive(runtime.serializeProject());
      downloadBlob(
        blob,
        buildExportFileName({
          baseName: state.title,
          extension: ".toymidi.zip",
        }),
      );
    },
  });
  const shareLinkMutation = useMutation({
    mutationFn: async () => {
      await navigator.clipboard.writeText(
        await createShareLink(runtime.serializeProject()),
      );
    },
    onSuccess: () => {
      toast.success("Share link copied");
    },
  });

  const trackEntries = resolveTrackOrder({
    trackOrder: state.trackOrder,
    audioTracks: clipInteraction.audioTracks,
    midiTracks: state.midiTracks,
  });
  const orderedMidiTracks = trackEntries
    .filter((entry) => entry.kind === "midi")
    .map((entry) => entry.track);

  function togglePlay() {
    if (flags.transportDisabled) {
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
    if (flags.transportDisabled) {
      return;
    }
    if (flags.recordBlocker === "arm") {
      toast.warning("Arm a track to record");
      return;
    }
    if (flags.recordBlocker === "input") {
      promptInputOn();
      return;
    }
    recordMutation.mutate(flags.isRecording ? "stop" : "start");
  }

  function promptInputOn() {
    toast.warning("Turn input on to record");
    setIsInputPanelOpen(true);
  }

  useWindowEvent("keydown", (event) => {
    if (project.initError) {
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
    if (interaction.handleUndoRedoShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (matchKeyboardEvent(event, "Ctrl+C")) {
      // Preserve normal browser copy when the user selected rendered text.
      if (window.getSelection()?.isCollapsed === false) {
        return;
      }
      if (midiInteraction.copySelected()) {
        event.preventDefault();
        return;
      }
    }
    if (matchKeyboardEvent(event, "Ctrl+V")) {
      const beat = snapToGrid(
        secondsToBeats(runtime.transport.store.get().position, state.tempo),
        1 / timeline.subdivisionsPerBeat,
      );
      if (midiInteraction.paste(beat)) {
        event.preventDefault();
        return;
      }
    }
    if (midiInteraction.handleTabAnnotationShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (matchKeyboardEvent(event, "<") || matchKeyboardEvent(event, ">")) {
      if (flags.isRecording) {
        return;
      }
      event.preventDefault();
      const rate = getNextPlaybackRate({
        rate: state.playbackRate,
        direction: event.key === ">" ? "increase" : "decrease",
      });
      if (rate !== undefined) {
        runtime.setPlaybackRate(rate);
      }
      return;
    }
    if (matchKeyboardEvent(event, "L")) {
      event.preventDefault();
      locatorInteraction.add();
      return;
    }
    if (
      (matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace")) &&
      interaction.deleteSelection()
    ) {
      event.preventDefault();
      return;
    }
    if (matchKeyboardEvent(event, "Escape") && interaction.clearSelection()) {
      event.preventDefault();
      return;
    }
    const seekDirection = matchKeyboardEvent(event, "ArrowLeft")
      ? -1
      : matchKeyboardEvent(event, "ArrowRight")
        ? 1
        : 0;
    if (seekDirection !== 0 && !flags.isRecording) {
      event.preventDefault();
      const { position } = runtime.transport.store.get();
      runtime.seek(Math.max(0, position + seekDirection * 5));
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
      <Header
        title={project.ready ? state.title : undefined}
        draft={project.draft}
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
        runtime={runtime}
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
        onShareLink={() => shareLinkMutation.mutate()}
        onReferenceVideoOpenChange={setIsReferenceVideoOpen}
        mixerOpen={isMixerOpen}
        onMixerToggle={() => setIsMixerOpen((open) => !open)}
        onProjectCommentToggle={() => setIsProjectCommentOpen((open) => !open)}
        onHelpOpen={() => setIsHelpOpen(true)}
        inputPanelOpen={isInputPanelOpen}
        inputAccessRequired={input.initialized && !input.hasAccess}
        onInputPanelToggle={() => setIsInputPanelOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <LocatorRow
          locatorInteraction={locatorInteraction}
          onClearSelection={interaction.clearSelection}
          pixelsPerBeat={timeline.pixelsPerBeat}
          viewportStartBeat={timeline.viewportStartBeat}
          subdivisionsPerBeat={timeline.subdivisionsPerBeat}
          onSeekBeat={(beat) =>
            runtime.seek(beatsToSeconds(beat, timeline.tempo))
          }
        />
        <section
          data-testid="track-scroll"
          className="relative isolate min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
        >
          <div
            ref={timeline.viewportRef}
            className="pointer-events-none absolute inset-y-0 left-[15rem] right-0"
          />
          <div className="relative">
            <TimelinePlayhead
              runtime={runtime}
              tempo={timeline.tempo}
              pixelsPerBeat={timeline.pixelsPerBeat}
              viewportStartBeat={timeline.viewportStartBeat}
              viewportWidth={timeline.viewportWidth}
            />
            <TimelineHeader
              pixelsPerBeat={timeline.pixelsPerBeat}
              beatsPerBar={timeline.beatsPerBar}
              subdivisionsPerBeat={timeline.subdivisionsPerBeat}
              viewportStartBeat={timeline.viewportStartBeat}
              tempo={timeline.tempo}
              timelineWidth={timeline.viewportWidth}
              isAddingAudio={addAudioMutation.isPending}
              isRecording={flags.isRecording}
              isAddingMidi={addMidiMutation.isPending}
              onAddMidiTrack={() => addMidiMutation.mutate()}
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
                referenceVideo={clipInteraction.referenceVideo!}
                pixelsPerBeat={timeline.pixelsPerBeat}
                beatsPerBar={timeline.beatsPerBar}
                subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                viewportStartBeat={timeline.viewportStartBeat}
                tempo={timeline.tempo}
                viewportWidth={timeline.viewportWidth}
                onSeek={(position) => {
                  interaction.clearSelection();
                  runtime.seek(position);
                }}
                selected={clipInteraction.isSelected(REFERENCE_VIDEO_CLIP_ID)}
                onClipClick={(additive) =>
                  clipInteraction.select(REFERENCE_VIDEO_CLIP_ID, additive)
                }
                onEditStart={(edit) =>
                  clipInteraction.startEdit({
                    ...edit,
                    id: REFERENCE_VIDEO_CLIP_ID,
                  })
                }
                onEditUpdate={clipInteraction.updateEdit}
                onEditFinish={clipInteraction.finishEdit}
                onEditCancel={clipInteraction.cancelEdit}
                muted={state.referenceVideo.muted}
                onMutedChange={(muted) => runtime.setReferenceVideoMuted(muted)}
                onRemove={() => runtime.removeReferenceVideo()}
              />
            )}
            {trackEntries.map((entry, index) => {
              const move: TrackMoveControls = {
                canMoveUp: index > 0,
                canMoveDown: index < trackEntries.length - 1,
                onMove: (direction) =>
                  runtime.moveTrack({ id: entry.id, direction }),
              };
              switch (entry.kind) {
                case "audio": {
                  const { track } = entry;
                  const armed = state.armedTrackId === track.id;
                  const pendingRecording =
                    state.pendingRecording?.trackId === track.id
                      ? state.pendingRecording
                      : undefined;
                  const clipsExpanded = expandedClipTracks.includes(track.id);
                  return (
                    <Fragment key={track.id}>
                      <TrackRow
                        data-testid="audio-track-row"
                        title={track.name}
                        height={track.height}
                        gain={track.gain}
                        muted={track.muted}
                        soloed={track.soloed}
                        onGainChange={(gain) =>
                          runtime.setTrackMix(track.id, { gain })
                        }
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
                            move={move}
                            label={track.name}
                            removeDisabled={flags.isRecording}
                            showClips={track.showClips}
                            onShowClipsChange={(showClips) =>
                              runtime.setTrackShowClips({
                                id: track.id,
                                showClips,
                              })
                            }
                            onRename={(name) =>
                              runtime.setTrackName({ id: track.id, name })
                            }
                            onEffectsOpen={() => effects.showEffects(track.id)}
                            importDisabled={flags.isRecording}
                            onImport={(file) =>
                              importClipMutation.mutate({
                                trackId: track.id,
                                file,
                              })
                            }
                            onRemove={() => {
                              runtime.removeAudioTrack(track.id);
                              effects.closeEffects(track.id);
                            }}
                          />
                        }
                        recording={{
                          armed,
                          armDisabled: flags.isRecording,
                          monitoring: state.inputMonitoring && armed,
                          monitorDisabled: !input.active || !armed,
                          onArmedChange: (armed) => {
                            runtime.setArmedTrack(armed ? track.id : undefined);
                            if (armed && !input.active) {
                              promptInputOn();
                            }
                          },
                          onMonitoringChange: (monitoring) =>
                            runtime.setInputMonitoring(monitoring),
                        }}
                      >
                        <AudioTimelineLane
                          clips={track.clips}
                          regions={pendingRecording?.regions ?? track.regions}
                          testId="audio"
                          emptyLabel="Record or import audio"
                          recordingClipId={pendingRecording?.id}
                          pixelsPerBeat={timeline.pixelsPerBeat}
                          beatsPerBar={timeline.beatsPerBar}
                          subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                          viewportStartBeat={timeline.viewportStartBeat}
                          tempo={timeline.tempo}
                          viewportWidth={timeline.viewportWidth}
                          isClipSelected={clipInteraction.isSelected}
                          isClipEditing={clipInteraction.isEditing}
                          onClipClick={clipInteraction.select}
                          onEditStart={clipInteraction.startEdit}
                          onEditUpdate={clipInteraction.updateEdit}
                          onEditFinish={clipInteraction.finishEdit}
                          onEditCancel={clipInteraction.cancelEdit}
                          onSeek={(position) => {
                            interaction.clearSelection();
                            runtime.seek(position);
                          }}
                        />
                      </TrackRow>
                      {track.showClips && track.clips.length > 0 && (
                        <ClipsDisclosureRow
                          expanded={clipsExpanded}
                          clipCount={track.clips.length}
                          onExpandedChange={(expanded) =>
                            setExpandedClipTracks((ids) =>
                              expanded
                                ? [...ids, track.id]
                                : ids.filter((id) => id !== track.id),
                            )
                          }
                          newestFirst={clipsNewestFirst}
                          onNewestFirstChange={setClipsNewestFirst}
                        />
                      )}
                      {track.showClips &&
                        track.clips.length > 0 &&
                        clipsExpanded &&
                        (clipsNewestFirst
                          ? track.clips.toReversed()
                          : track.clips
                        ).map((clip) => (
                          <ClipTrackRow
                            key={clip.id}
                            label={clip.name}
                            gain={clip.gain}
                            onGainChange={(gain) =>
                              runtime.setClipGain({ id: clip.id, gain })
                            }
                            muted={clip.muted}
                            soloed={clip.soloed}
                            onMutedChange={(muted) =>
                              runtime.setClipMuted({ id: clip.id, muted })
                            }
                            onSoloedChange={(soloed) =>
                              runtime.setClipSoloed({ id: clip.id, soloed })
                            }
                            onDelete={() => runtime.removeClips([clip.id])}
                          >
                            <AudioTimelineLane
                              clips={[clip]}
                              regions={deriveClipRegions([clip])}
                              testId="clip-lane"
                              pixelsPerBeat={timeline.pixelsPerBeat}
                              beatsPerBar={timeline.beatsPerBar}
                              subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                              viewportStartBeat={timeline.viewportStartBeat}
                              tempo={timeline.tempo}
                              viewportWidth={timeline.viewportWidth}
                              isClipSelected={clipInteraction.isSelected}
                              isClipEditing={clipInteraction.isEditing}
                              onClipClick={clipInteraction.select}
                              onEditStart={clipInteraction.startEdit}
                              onEditUpdate={clipInteraction.updateEdit}
                              onEditFinish={clipInteraction.finishEdit}
                              onEditCancel={clipInteraction.cancelEdit}
                              onSeek={(position) => {
                                interaction.clearSelection();
                                runtime.seek(position);
                              }}
                            />
                          </ClipTrackRow>
                        ))}
                    </Fragment>
                  );
                }
                case "midi": {
                  const { track } = entry;
                  return (
                    <MidiTrackRow
                      move={move}
                      key={track.id}
                      track={track}
                      runtime={runtime}
                      pixelsPerBeat={timeline.pixelsPerBeat}
                      beatsPerBar={timeline.beatsPerBar}
                      subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                      viewportStartBeat={timeline.viewportStartBeat}
                      onEffectsOpen={() => effects.showEffects(track.id)}
                      onRemove={() => {
                        runtime.removeMidiTrack(track.id);
                        effects.closeEffects(track.id);
                        transcriptions.closeTranscription(track.id);
                        scoreUi.close(track.id);
                      }}
                      midiInteraction={midiInteraction}
                      onTranscribe={() =>
                        transcriptions.openTranscription(track.id)
                      }
                      onScorePreview={() => scoreUi.open(track.id)}
                    />
                  );
                }
              }
            })}
          </div>
        </section>

        <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        <ExportDialog
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
          data-testid="input-setup"
        >
          <InputSetup
            runtime={runtime}
            devices={input.devices}
            error={input.error}
            hasAccess={input.hasAccess}
            inputActive={input.active}
            inputAnalyser={runtime.captureInput?.analyser}
            inputsInitialized={input.initialized}
            isRecording={flags.isRecording}
            isPlaying={state.isPlaying}
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
          <div className="pointer-events-auto flex min-w-0 items-end gap-4 overflow-x-auto">
            {trackEntries.map((entry) => {
              if (!effects.openEffects.has(entry.id)) {
                return undefined;
              }
              const { track } = entry;
              return (
                <Effects
                  key={entry.id}
                  label={track.name}
                  eq={track.eq}
                  onChange={(eq) => runtime.setTrackEq({ id: track.id, eq })}
                  onClose={() => effects.closeEffects(track.id)}
                />
              );
            })}
          </div>
        )}
        {orderedMidiTracks.map(
          (track) =>
            scoreUi.openTracks.has(track.id) && (
              <ScorePanel
                key={track.id}
                runtime={runtime}
                state={state}
                track={track}
                onClose={() => scoreUi.close(track.id)}
                scoreViewerHref={
                  source.type === "stored" &&
                  project.ready &&
                  project.saveStatus === "saved" &&
                  !flags.isRecording
                    ? getScoreHref({
                        projectId: source.projectId,
                        trackId: track.id,
                      })
                    : undefined
                }
              />
            ),
        )}
        {orderedMidiTracks.map(
          (track) =>
            transcriptions.openTranscriptions.has(track.id) && (
              <AudioToMidi
                key={track.id}
                runtime={runtime}
                state={state}
                track={track}
                cellsPerBeat={timeline.subdivisionsPerBeat}
                onClose={() => transcriptions.closeTranscription(track.id)}
              />
            ),
        )}
        {isTunerOpen && (
          <Tuner
            analyser={
              // TODO: Make the capture input reactive if compiler memoization can
              // retain this mutable runtime field across input changes.
              runtime.captureInput?.tunerAnalyser
            }
            onClose={() => setIsTunerOpen(false)}
          />
        )}
        {isInputPanelOpen && (
          <InputPanel
            route={input.route.label}
            routeNeedsSetup={input.route.needsSetup}
            accessRequired={input.initialized && !input.hasAccess}
            inputActive={input.active}
            inputAnalyser={runtime.captureInput?.analyser}
            toggleDisabled={
              input.mutationPending ||
              !input.initialized ||
              flags.isRecording ||
              (input.hasAccess && !input.active && input.route.needsSetup)
            }
            togglePending={input.togglePending}
            tunerOpen={isTunerOpen}
            onInputSetup={() => setIsInputSetupOpen(true)}
            onInputToggle={input.toggle}
            onTunerToggle={() => setIsTunerOpen((open) => !open)}
            onClose={() => setIsInputPanelOpen(false)}
          />
        )}
        {isMixerOpen && (
          <Panel
            closeLabel="Close Mixer"
            onClose={() => setIsMixerOpen(false)}
            title="Mixer"
            data-testid="mixer-panel"
            className="pointer-events-auto flex-1"
          >
            <Mixer
              runtime={runtime}
              state={state}
              openEffects={effects.openEffects}
              onEffectsToggle={effects.toggleEffects}
            />
          </Panel>
        )}
        {isProjectCommentOpen && (
          <ProjectCommentPanel
            projectUiStore={projectUiStore}
            runtime={runtime}
            comment={state.comment}
            onClose={() => setIsProjectCommentOpen(false)}
          />
        )}
        {isReferenceVideoOpen && (
          <ReferenceVideoPanel
            projectUiStore={projectUiStore}
            referenceVideo={state.referenceVideo}
            runtime={runtime}
            onClose={() => setIsReferenceVideoOpen(false)}
          />
        )}
      </div>
      {project.initError &&
        createPortal(
          <EditorInitError error={project.initError} />,
          document.body,
        )}
    </main>
  );
}

// Rendered outside the inert editor so the notice stays interactive while
// everything beneath it is blocked from pointer and keyboard access.
function EditorInitError({ error }: { error: Error }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="init-error-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4 text-neutral-100"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800 p-6 text-center shadow-2xl">
        <Mic2Icon className="size-6 text-emerald-400" />
        <div className="flex flex-col gap-1">
          <h1 id="init-error-title" className="text-lg font-medium">
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
