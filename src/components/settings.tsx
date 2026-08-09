import { useMutation } from "@tanstack/react-query";
import {
  DownloadIcon,
  FileMusicIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDraftTextInput } from "../hooks/use-draft-text-input";
import { audioManager, loadAudioFile } from "../lib/audio";
import { resolveAudioFiles } from "../lib/audio-files";
import { buildExportFileName, downloadBlob } from "../lib/export-utils";
import { exportMidi } from "../lib/midi-export";
import { importMidiNotes, type MidiImportOptions } from "../lib/midi-import";
import { exportMusicXml } from "../lib/musicxml/render";
import { KEY_SIGNATURE_OPTION_GROUPS } from "../lib/pitch-spelling";
import { exportProjectFile } from "../lib/project-file";
import { projectStorage } from "../lib/project-storage";
import {
  type AudioTrack,
  DEFAULT_WAVEFORM_HEIGHT,
  generateAudioTrackId,
  toSavedProject,
  useProjectStore,
} from "../lib/project-store";
import {
  resolveTabStringPreset,
  TAB_STRING_PRESETS,
} from "../lib/tab-annotation";
import { FileDropInput } from "./file-drop-input";
import { Button } from "./ui/button";

type SettingsProps = {
  // Project section
  projectName: string;
  projectScoreHref: string;
  onProjectNameChange: (name: string) => void;
  onProjectScoreOpen: () => void;
  // Closes settings and opens the transcription panel for the track
  onAudioToMidiClick: (trackId: string) => void;
};

export function Settings({
  projectName,
  projectScoreHref,
  onProjectNameChange,
  onProjectScoreOpen,
  onAudioToMidiClick,
}: SettingsProps) {
  const projectNameInput = useDraftTextInput({
    value: projectName,
    onCommit: onProjectNameChange,
    normalize: (value) => value.trim(),
    isValid: (value) => value.length > 0,
  });
  const {
    audioTracks,
    tempo,
    timeSignature,
    keySignature,
    notes,
    locators,
    autoScrollEnabled,
    linkAudioOffsetsEnabled,
    tabAnnotationEnabled,
    tabOpenStringPitches,
    setAutoScrollEnabled,
    setLinkAudioOffsetsEnabled,
    setTabAnnotationEnabled,
    setTabOpenStringPitches,
    setKeySignature,
    addAudioTrack,
    deleteAudioTrack,
  } = useProjectStore();

  const importMidiMutation = useMutation({
    mutationFn: async (file: File) => {
      // First parse to get available tracks
      const parsed = await import("../lib/midi-import").then((m) =>
        m.parseMidiFile(file),
      );

      // Import all tracks
      const options: MidiImportOptions = {
        trackIndices: parsed.tracks.map((t) => t.index),
        replaceExisting: true, // Replace existing notes by default
        importTempo: true,
        importTimeSignature: true,
      };

      const result = await importMidiNotes(file, options);

      // Replace all notes
      useProjectStore.setState({ notes: result.notes });

      // Apply tempo and time signature
      if (result.tempo) {
        useProjectStore.getState().setTempo(result.tempo);
      }
      if (result.timeSignature) {
        useProjectStore.getState().setTimeSignature(result.timeSignature);
      }

      return result.notes.length;
    },
    onSuccess: (noteCount) => {
      toast.success(`Imported ${noteCount} notes from MIDI file`);
    },
    onError: (error) => {
      console.error("Failed to import MIDI:", error);
      toast.error("Failed to import MIDI file");
    },
  });

  const handleImportMidi = (file: File) => {
    if (
      !window.confirm(
        "Import MIDI file? This will replace all notes and may update the tempo and time signature.",
      )
    ) {
      return;
    }
    importMidiMutation.mutate(file);
  };

  const loadAudioMutation = useMutation({
    mutationFn: async (input: File) => {
      const files = await resolveAudioFiles(input);
      for (const file of files) {
        const { buffer, audioView } = await loadAudioFile(file);

        // Save audio to IndexedDB for persistence
        const assetKey = await projectStorage.saveAsset(file);

        const id = generateAudioTrackId();
        // Assign the buffer before adding to the store so the state-sync
        // subscription can immediately sync the loaded player to the Transport.
        audioManager.getAudioTrack(id).setBuffer(buffer);
        addAudioTrack({
          id,
          fileName: file.name,
          assetKey,
          duration: buffer.duration,
          offset: 0,
          volume: 0.8,
          muted: false,
          soloed: false,
          waveformHeight: DEFAULT_WAVEFORM_HEIGHT,
          audioWaveform: audioView
            ? { status: "ready", view: audioView }
            : { status: "unavailable" },
        });
      }
    },
    onError: (error) => {
      console.error("Failed to load audio:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load audio",
      );
    },
  });

  const handleRemoveAudio = async (track: AudioTrack) => {
    // Delete from IndexedDB if we have a key
    await projectStorage.deleteAsset(track.assetKey);
    // Removing from the store disposes the player via the state-sync subscription
    deleteAudioTrack(track.id);
  };

  const handleExportMidi = () => {
    const midiData = exportMidi({
      notes,
      tempo,
      timeSignature,
      name: projectName,
      trackName: projectName,
    });

    const fileName = buildExportFileName({
      baseName: projectName,
      extension: ".mid",
    });

    downloadBlob(
      new Blob([midiData as BlobPart], { type: "audio/midi" }),
      fileName,
    );
  };

  const exportMusicXmlMutation = useMutation({
    mutationFn: async () => {
      const xml = exportMusicXml({
        notes,
        locators,
        tempo,
        title: projectName,
        timeSignature,
        keySignature,
        openStringPitches: tabOpenStringPitches,
      });
      const fileName = buildExportFileName({
        baseName: projectName,
        extension: ".musicxml",
      });
      downloadBlob(
        new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }),
        fileName,
      );
    },
  });

  const exportProjectMutation = useMutation({
    mutationFn: async () => {
      const projectData = toSavedProject(useProjectStore.getState());
      const blob = await exportProjectFile(projectName, projectData);
      const fileName = buildExportFileName({
        baseName: projectName,
        extension: ".toymidi",
      });
      downloadBlob(blob, fileName);
    },
    onError: (error) => {
      console.error("Failed to export project:", error);
      toast.error("Failed to export project");
    },
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <label
          htmlFor="settings-project-name"
          className="block text-xs text-neutral-400 mb-1"
        >
          Name
        </label>
        <input
          id="settings-project-name"
          type="text"
          {...projectNameInput.props}
          className="w-full h-8 px-2 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
          placeholder="Enter project name"
        />
        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScrollEnabled}
              onChange={(e) => setAutoScrollEnabled(e.target.checked)}
              className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">
              Auto-scroll during playback{" "}
              <span className="text-xs text-neutral-500">(F)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={linkAudioOffsetsEnabled}
              onChange={(e) => setLinkAudioOffsetsEnabled(e.target.checked)}
              className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">Link audio offsets</span>
          </label>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                data-testid="tab-annotation-toggle"
                type="checkbox"
                checked={tabAnnotationEnabled}
                onChange={(e) => setTabAnnotationEnabled(e.target.checked)}
                className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-sm text-neutral-300">Tab annotations</span>
            </label>
            <select
              aria-label="Tuning"
              data-testid="tab-string-preset-select"
              value={resolveTabStringPreset(tabOpenStringPitches)?.id}
              onChange={(e) => {
                const preset = TAB_STRING_PRESETS.find(
                  ({ id }) => id === e.target.value,
                )!;
                setTabOpenStringPitches([...preset.openStringPitches]);
              }}
              className="h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              {TAB_STRING_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="key-signature-select"
              className="text-sm text-neutral-300"
            >
              Key signature
            </label>
            <select
              id="key-signature-select"
              data-testid="key-signature-select"
              value={`${keySignature.fifths}:${keySignature.mode}`}
              onChange={(e) => {
                const [fifths, mode] = e.target.value.split(":");
                setKeySignature({
                  fifths: Number(fifths),
                  mode: mode as "major" | "minor",
                });
              }}
              className="h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              {KEY_SIGNATURE_OPTION_GROUPS.map((group) => (
                <optgroup key={group.mode} label={group.label}>
                  {group.options.map((key) => (
                    <option
                      key={`${key.fifths}:${group.mode}`}
                      value={`${key.fifths}:${group.mode}`}
                    >
                      {key.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-2 border-t border-neutral-700 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Audio Sources
          </h3>
          <FileDropInput
            accept="audio/*,.zip,application/zip"
            data-testid="load-audio-button"
            disabled={loadAudioMutation.isPending}
            inputProps={{ "data-testid": "audio-file-input" }}
            className="h-7 gap-1.5 px-2 bg-background text-xs text-neutral-300 shadow-xs hover:bg-accent hover:text-accent-foreground data-[drag-over=true]:border-emerald-500/60 data-[drag-over=true]:bg-emerald-950/30 dark:bg-input/30 dark:border-input dark:hover:bg-input/50 disabled:opacity-50"
            onFile={(file) => loadAudioMutation.mutate(file)}
          >
            <UploadIcon className="size-4" />
            {loadAudioMutation.isPending ? "Loading..." : "Add audio"}
          </FileDropInput>
        </div>
        {audioTracks.length > 0 && (
          <div>
            {audioTracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2 py-1.5 pl-2"
              >
                <div className="flex-1 text-sm text-neutral-200 truncate">
                  {track.fileName}
                </div>
                <Button
                  data-testid="audio-to-midi-button"
                  onClick={() => onAudioToMidiClick(track.id)}
                  title={`Transcribe ${track.fileName} to MIDI notes`}
                  className="h-7 gap-1.5 px-2 bg-background text-xs shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
                >
                  <SparklesIcon className="size-4" />
                  To MIDI
                </Button>
                <Button
                  data-testid="remove-audio-button"
                  onClick={() => handleRemoveAudio(track)}
                  title={`Remove ${track.fileName}`}
                  className="h-7 gap-1.5 px-2 bg-background text-xs shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
                >
                  <Trash2Icon className="size-4" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-neutral-700 pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Files
        </h3>
        <div className="space-y-2">
          <FileDropInput
            accept=".mid,.midi"
            data-testid="import-midi-button"
            disabled={importMidiMutation.isPending}
            inputProps={{ "data-testid": "midi-file-input" }}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground data-[drag-over=true]:border-emerald-500/60 data-[drag-over=true]:bg-emerald-950/30 dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
            onFile={handleImportMidi}
          >
            <UploadIcon className="size-4" />
            {importMidiMutation.isPending ? "Importing..." : "Import MIDI"}
          </FileDropInput>
          <Button
            data-testid="export-midi-button"
            onClick={handleExportMidi}
            disabled={notes.length === 0}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            Export MIDI
          </Button>
          <a
            href={projectScoreHref}
            target="_blank"
            rel="noreferrer"
            data-testid="view-score-button"
            onClick={onProjectScoreOpen}
            className="inline-flex h-8 w-full items-center justify-start gap-1.5 rounded-md border border-border bg-background px-3 text-sm shadow-xs transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
          >
            <FileMusicIcon className="size-4" />
            View Score
          </a>
          <Button
            data-testid="export-musicxml-button"
            onClick={() => exportMusicXmlMutation.mutate()}
            disabled={notes.length === 0 || exportMusicXmlMutation.isPending}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            Export MusicXML
          </Button>
          {exportMusicXmlMutation.error && (
            <p
              data-testid="export-musicxml-error"
              className="text-xs text-red-300"
            >
              {exportMusicXmlMutation.error instanceof Error
                ? exportMusicXmlMutation.error.message
                : "Failed to export MusicXML"}
            </p>
          )}
          <Button
            data-testid="export-project-button"
            onClick={() => exportProjectMutation.mutate()}
            disabled={exportProjectMutation.isPending}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            {exportProjectMutation.isPending
              ? "Exporting..."
              : "Export Project Archive"}
          </Button>
        </div>
      </section>
    </div>
  );
}
