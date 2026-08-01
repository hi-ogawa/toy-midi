import { useMutation } from "@tanstack/react-query";
import {
  DownloadIcon,
  FolderIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDraftTextInput } from "../hooks/use-draft-text-input";
import { audioManager, loadAudioFile } from "../lib/audio";
import { resolveAudioFiles } from "../lib/audio-files";
import { buildExportFileName } from "../lib/export-utils";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { importMidiNotes, type MidiImportOptions } from "../lib/midi-import";
import { downloadProjectFile, exportProjectFile } from "../lib/project-file";
import { projectStorage } from "../lib/project-storage";
import {
  type AudioTrack,
  DEFAULT_WAVEFORM_HEIGHT,
  generateAudioTrackId,
  toSavedProject,
  useProjectStore,
} from "../lib/project-store";
import { TAB_OPEN_STRING_PRESETS } from "../lib/tab-annotation";
import { FileDropInput } from "./file-drop-input";
import { Button, LinkButton } from "./ui/button";

type SettingsProps = {
  // Project section
  projectName: string;
  onProjectNameChange: (name: string) => void;
  // Closes settings and opens the transcription panel for the track
  onAudioToMidiClick: (trackId: string) => void;
};

export function Settings({
  projectName,
  onProjectNameChange,
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
    notes,
    autoScrollEnabled,
    linkAudioOffsetsEnabled,
    tabAnnotationEnabled,
    tabOpenStringPitches,
    setAutoScrollEnabled,
    setLinkAudioOffsetsEnabled,
    setTabAnnotationEnabled,
    setTabOpenStringPitches,
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

    downloadMidiFile(midiData, fileName);
  };

  const exportProjectMutation = useMutation({
    mutationFn: async () => {
      const projectData = toSavedProject(useProjectStore.getState());
      const blob = await exportProjectFile(projectName, projectData);
      downloadProjectFile(blob, projectName);
    },
    onError: (error) => {
      console.error("Failed to export project:", error);
      toast.error("Failed to export project");
    },
  });

  return (
    <div className="space-y-6">
      {/* Project Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <SettingsIcon className="size-4" />
          Project
        </h3>
        <div className="pl-6 space-y-2">
          <div>
            <label
              htmlFor="settings-project-name"
              className="block text-xs text-neutral-400 mb-1"
            >
              Project Name
            </label>
            <input
              id="settings-project-name"
              type="text"
              {...projectNameInput.props}
              className="w-full h-8 px-2 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
              placeholder="Enter project name"
            />
          </div>
          <LinkButton
            href="/"
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <FolderIcon className="size-4" />
            Manage Projects
          </LinkButton>
        </div>
      </section>

      {/* Audio Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <UploadIcon className="size-4" />
          Audio
          <span className="text-xs font-normal text-neutral-500">
            ({audioTracks.length})
          </span>
        </h3>
        <div className="pl-6 space-y-2">
          {audioTracks.map((track) => (
            <div key={track.id} className="flex items-center gap-2">
              <div className="flex-1 text-sm text-neutral-200 truncate">
                {track.fileName}
              </div>
              <Button
                data-testid="audio-to-midi-button"
                onClick={() => onAudioToMidiClick(track.id)}
                title={`Transcribe ${track.fileName} to MIDI notes`}
                className="h-8 gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
              >
                <SparklesIcon className="size-4" />
                To MIDI
              </Button>
              <Button
                data-testid="remove-audio-button"
                onClick={() => handleRemoveAudio(track)}
                title={`Remove ${track.fileName}`}
                className="h-8 gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
              >
                <Trash2Icon className="size-4" />
                Remove
              </Button>
            </div>
          ))}
          <FileDropInput
            accept="audio/*,.zip,application/zip"
            data-testid="load-audio-button"
            disabled={loadAudioMutation.isPending}
            inputProps={{ "data-testid": "audio-file-input" }}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground data-[drag-over=true]:border-emerald-500/60 data-[drag-over=true]:bg-emerald-950/30 dark:bg-input/30 dark:border-input dark:hover:bg-input/50 disabled:opacity-50"
            onFile={(file) => loadAudioMutation.mutate(file)}
          >
            <UploadIcon className="size-4" />
            {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
          </FileDropInput>
        </div>
      </section>

      {/* MIDI Import Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <UploadIcon className="size-4" />
          Import MIDI
        </h3>
        <div className="pl-6 space-y-2">
          <FileDropInput
            accept=".mid,.midi"
            data-testid="import-midi-button"
            disabled={importMidiMutation.isPending}
            inputProps={{ "data-testid": "midi-file-input" }}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground data-[drag-over=true]:border-emerald-500/60 data-[drag-over=true]:bg-emerald-950/30 dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
            onFile={(file) => importMidiMutation.mutate(file)}
          >
            <UploadIcon className="size-4" />
            {importMidiMutation.isPending ? "Importing..." : "Import MIDI File"}
          </FileDropInput>
          <p className="text-xs text-neutral-500">
            Import notes from MIDI file (replaces existing notes)
          </p>
        </div>
      </section>

      {/* Export Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <DownloadIcon className="size-4" />
          Export
        </h3>
        <div className="pl-6 space-y-2">
          <Button
            data-testid="export-project-button"
            onClick={() => exportProjectMutation.mutate()}
            disabled={exportProjectMutation.isPending}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            {exportProjectMutation.isPending
              ? "Exporting..."
              : "Export Project"}
          </Button>
          <Button
            data-testid="export-midi-button"
            onClick={handleExportMidi}
            disabled={notes.length === 0}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            Export MIDI
          </Button>
        </div>
      </section>

      {/* Preferences Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <SettingsIcon className="size-4" />
          Preferences
        </h3>
        <div className="pl-6 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScrollEnabled}
              onChange={(e) => setAutoScrollEnabled(e.target.checked)}
              className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">
              Auto-scroll <span className="text-xs text-neutral-500">(F)</span>
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
          <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
            String setup
            <select
              data-testid="tab-string-setup-select"
              value={
                tabOpenStringPitches.length === 5 ? "fiveString" : "fourString"
              }
              onChange={(e) => {
                const setup = e.target
                  .value as keyof typeof TAB_OPEN_STRING_PRESETS;
                setTabOpenStringPitches([...TAB_OPEN_STRING_PRESETS[setup]]);
              }}
              className="h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            >
              <option value="fourString">4-string</option>
              <option value="fiveString">5-string</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
