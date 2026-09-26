import { useMutation } from "@tanstack/react-query";
import { Mic2Icon } from "lucide-react";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useSetState } from "../../hooks/use-set-state";
import { useWindowEvent } from "../../hooks/use-window-event";
import { resolveAudioFiles } from "../../lib/audio-files";
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import { snapToGrid } from "../../lib/music";
import { deriveClipRegions } from "../../lib/recorder/clip-regions";
import { getNextPlaybackRate } from "../../lib/recorder/playback-rate";
import { exportRecorderProjectArchive } from "../../lib/recorder/project-archive";
import {
  RecorderRuntime,
  REFERENCE_VIDEO_CLIP_ID,
} from "../../lib/recorder/runtime";
import { getRecorderScoreHref, routes } from "../../lib/routes";
import { beatsToSeconds, secondsToBeats } from "../../lib/timeline";
import { parseTimeSignature } from "../../types";
import { Dialog } from "../ui/dialog";
import { RecorderHelp } from "./help";
import {
  RecorderAudioToMidi,
  useRecorderAudioToMidiUi,
} from "./recorder-audio-to-midi";
import { RecorderEffects, useRecorderEffectsUi } from "./recorder-effects";
import { RecorderExportDialog } from "./recorder-export-dialog";
import { deriveRecorderFlags } from "./recorder-flags";
import { RecorderHeader } from "./recorder-header";
import { InputSetup } from "./recorder-input";
import { RecorderInputPanel } from "./recorder-input-panel";
import { RecorderLocatorRow } from "./recorder-locators";
import { MidiTrackRow } from "./recorder-midi-track";
import { RecorderMixer } from "./recorder-mixer";
import { RecorderPanel } from "./recorder-panel";
import {
  RecorderScorePanel,
  useRecorderScorePanelUi,
} from "./recorder-score-panel";
import {
  ReferenceTimelineRow,
  TimelineHeader,
  AudioTimelineLane,
} from "./recorder-timeline";
import {
  AudioTrackActions,
  ClipsDisclosureRow,
  ClipTrackRow,
  TrackRow,
} from "./recorder-tracks";
import { RecorderTuner } from "./recorder-tuner";
import { ReferenceVideoPanel } from "./reference-video";
import { useRecorderInput } from "./use-recorder-input";
import { useRecorderInteraction } from "./use-recorder-interaction";
import { useRecorderPreference } from "./use-recorder-preference";
import { useRecorderProject } from "./use-recorder-project";
import { useRecorderTimeline } from "./use-recorder-timeline";

export function Recorder({ projectId }: { projectId: string }) {
  const [runtime] = useState(() => new RecorderRuntime());
  const [defaultMidiProgram, setDefaultMidiProgram] =
    useRecorderPreference("defaultMidiProgram");
  const [isInputSetupOpen, setIsInputSetupOpen] = useState(false);
  const [isReferenceVideoOpen, setIsReferenceVideoOpen] = useState(false);
  const [expandedClipTracks, setClipExpanded] = useSetState<string>();
  const [clipsNewestFirst, setClipsNewestFirst] =
    useRecorderPreference("takesNewestFirst");
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [isInputPanelOpen, setIsInputPanelOpen] =
    useRecorderPreference("inputPanelOpen");
  const effects = useRecorderEffectsUi();
  const [isAudioExportOpen, setIsAudioExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  useEffect(() => {
    document.title = `${state.title} - Toy MIDI`;
  }, [state.title]);

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
  const flags = deriveRecorderFlags({ state, project });
  const recorderInteraction = useRecorderInteraction({
    runtime,
    state,
    isRecording: flags.isRecording,
    subdivisionsPerBeat: timeline.subdivisionsPerBeat,
  });
  const { clipInteraction, locatorInteraction, midiInteraction } =
    recorderInteraction;
  const transcriptions = useRecorderAudioToMidiUi();
  const scoreUi = useRecorderScorePanelUi();

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
  const addMidiMutation = useMutation({
    mutationFn: () => runtime.addMidiTrack({ program: defaultMidiProgram }),
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
    if (recorderInteraction.handleUndoRedoShortcut(event)) {
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
        secondsToBeats(state.position, state.tempo),
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
      recorderInteraction.deleteSelection()
    ) {
      event.preventDefault();
      return;
    }
    if (
      matchKeyboardEvent(event, "Escape") &&
      recorderInteraction.clearSelection()
    ) {
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
      const position = Math.max(0, state.position + seekDirection * 5);
      runtime.seek(position);
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
        inputPanelOpen={isInputPanelOpen}
        inputAccessRequired={input.initialized && !input.hasAccess}
        onInputPanelToggle={() => setIsInputPanelOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <RecorderLocatorRow
          locatorInteraction={locatorInteraction}
          onClearSelection={recorderInteraction.clearSelection}
          pixelsPerBeat={timeline.pixelsPerBeat}
          viewportStartBeat={timeline.viewportStartBeat}
          subdivisionsPerBeat={timeline.subdivisionsPerBeat}
          onSeekBeat={(beat) =>
            runtime.seek(beatsToSeconds(beat, timeline.tempo))
          }
        />
        <section
          data-testid="recorder-track-scroll"
          className="relative isolate min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
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
                position={state.position}
                pixelsPerBeat={timeline.pixelsPerBeat}
                beatsPerBar={timeline.beatsPerBar}
                subdivisionsPerBeat={timeline.subdivisionsPerBeat}
                viewportStartBeat={timeline.viewportStartBeat}
                tempo={timeline.tempo}
                viewportWidth={timeline.viewportWidth}
                onSeek={(position) => {
                  recorderInteraction.clearSelection();
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
            {clipInteraction.audioTracks.map((track) => {
              const armed = state.armedTrackId === track.id;
              const pendingRecording =
                state.pendingRecording?.trackId === track.id
                  ? state.pendingRecording
                  : undefined;
              const clipsExpanded = expandedClipTracks.has(track.id);
              return (
                <Fragment key={track.id}>
                  <TrackRow
                    data-testid="recorder-audio-track-row"
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
                        label={track.name}
                        removeDisabled={flags.isRecording}
                        onRename={(name) =>
                          runtime.setTrackName({ id: track.id, name })
                        }
                        onEffectsOpen={() => effects.showEffects(track.id)}
                        onFileChange={(file) =>
                          audioTrackMutation.mutate({ file, id: track.id })
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
                        recorderInteraction.clearSelection();
                        runtime.seek(position);
                      }}
                    />
                  </TrackRow>
                  {track.clips.length > 0 && (
                    <ClipsDisclosureRow
                      expanded={clipsExpanded}
                      clipCount={track.clips.length}
                      onExpandedChange={(expanded) =>
                        setClipExpanded({ value: track.id, present: expanded })
                      }
                      newestFirst={clipsNewestFirst}
                      onNewestFirstChange={setClipsNewestFirst}
                    />
                  )}
                  {track.clips.length > 0 &&
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
                            recorderInteraction.clearSelection();
                            runtime.seek(position);
                          }}
                        />
                      </ClipTrackRow>
                    ))}
                </Fragment>
              );
            })}
            {state.midiTracks.map((track) => (
              <MidiTrackRow
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
                onTranscribe={() => transcriptions.openTranscription(track.id)}
                onScorePreview={() => scoreUi.open(track.id)}
                onProgramSelected={setDefaultMidiProgram}
              />
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
            {state.audioTracks.map(
              (track) =>
                effects.openEffects.has(track.id) && (
                  <RecorderEffects
                    key={track.id}
                    label={track.name}
                    eq={track.eq}
                    onChange={(eq) => runtime.setTrackEq({ id: track.id, eq })}
                    onClose={() => effects.closeEffects(track.id)}
                  />
                ),
            )}
            {state.midiTracks.map(
              (track) =>
                effects.openEffects.has(track.id) && (
                  <RecorderEffects
                    key={track.id}
                    label={track.name}
                    eq={track.eq}
                    onChange={(eq) => runtime.setTrackEq({ id: track.id, eq })}
                    onClose={() => effects.closeEffects(track.id)}
                  />
                ),
            )}
          </div>
        )}
        {state.midiTracks.map(
          (track) =>
            scoreUi.openTracks.has(track.id) && (
              <RecorderScorePanel
                key={track.id}
                runtime={runtime}
                state={state}
                track={track}
                onClose={() => scoreUi.close(track.id)}
                scoreViewerHref={
                  project.ready &&
                  project.saveStatus === "saved" &&
                  !flags.isRecording
                    ? getRecorderScoreHref({
                        projectId,
                        trackId: track.id,
                      })
                    : undefined
                }
              />
            ),
        )}
        {state.midiTracks.map(
          (track) =>
            transcriptions.openTranscriptions.has(track.id) && (
              <RecorderAudioToMidi
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
          <RecorderTuner
            analyser={
              // TODO: Make the capture input reactive if compiler memoization can
              // retain this mutable runtime field across input changes.
              runtime.captureInput?.tunerAnalyser
            }
            onClose={() => setIsTunerOpen(false)}
          />
        )}
        {isInputPanelOpen && (
          <RecorderInputPanel
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
