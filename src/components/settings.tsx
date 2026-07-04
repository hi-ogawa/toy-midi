import { useMutation } from "@tanstack/react-query";
import {
  ClipboardIcon,
  DownloadIcon,
  FolderIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDraftTextInput } from "../hooks/use-draft-text-input";
import {
  copyABCToClipboard,
  downloadABCFile,
  exportABC,
} from "../lib/abc-export";
import { deleteAsset, saveAsset } from "../lib/asset-store";
import { audioManager, loadAudioFile } from "../lib/audio";
import { buildExportFileName } from "../lib/export-utils";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { importMidiNotes, type MidiImportOptions } from "../lib/midi-import";
import { downloadProjectFile, exportProjectFile } from "../lib/project-file";
import { toSavedProject, useProjectStore } from "../stores/project-store";
import { FileDropInput } from "./file-drop-input";
import { Button } from "./ui/button";

type SettingsProps = {
  // Project section
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onProjectsClick: () => void;
};

export function Settings({
  projectName,
  onProjectNameChange,
  onProjectsClick,
}: SettingsProps) {
  const projectNameInput = useDraftTextInput({
    value: projectName,
    onCommit: onProjectNameChange,
    normalize: (value) => value.trim(),
    isValid: (value) => value.length > 0,
  });
  const {
    audioFileName,
    audioAssetKey,
    tempo,
    timeSignature,
    notes,
    autoScrollEnabled,
    showDebug,
    setAutoScrollEnabled,
    setShowDebug,
    setAudioFile,
    setAudioOffset,
    setAudioView,
    clearAudioFile,
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
    mutationFn: async (file: File) => {
      const { buffer, audioView } = await loadAudioFile(file);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);
      setAudioFile(file.name, buffer.duration, assetKey);

      audioManager.player.buffer = buffer;
      audioManager.player.sync().start(0);
      setAudioOffset(0);

      setAudioView(audioView);
    },
  });

  const handleRemoveAudio = async () => {
    // Delete from IndexedDB if we have a key
    if (audioAssetKey) {
      await deleteAsset(audioAssetKey);
    }
    // Clear the audio buffer in the player
    audioManager.clearAudioBuffer();
    // Clear store state
    clearAudioFile();
  };

  const handleExportMidi = () => {
    const midiData = exportMidi({
      notes,
      tempo,
      timeSignature,
      trackName: projectName,
    });

    const fileName = buildExportFileName({
      baseName: projectName,
      extension: ".mid",
    });

    downloadMidiFile(midiData, fileName);
  };

  const handleExportABC = () => {
    const abcText = exportABC({
      notes,
      tempo,
      timeSignature,
      title: projectName,
    });

    const fileName = buildExportFileName({
      baseName: projectName,
      extension: ".abc",
    });

    downloadABCFile(abcText, fileName);
  };

  const handleCopyABCToClipboard = async () => {
    try {
      const abcText = exportABC({
        notes,
        tempo,
        timeSignature,
        title: projectName,
      });

      await copyABCToClipboard(abcText);
      toast.success("ABC notation copied to clipboard");
    } catch (error) {
      console.error("Failed to copy ABC notation:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleExportProject = async () => {
    try {
      const projectData = toSavedProject(useProjectStore.getState());
      const blob = await exportProjectFile(projectName, projectData);
      downloadProjectFile(blob, projectName);
    } catch (error) {
      console.error("Failed to export project:", error);
      toast.error("Failed to export project");
    }
  };

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
          <Button
            onClick={onProjectsClick}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <FolderIcon className="size-4" />
            Manage Projects
          </Button>
        </div>
      </section>

      {/* Audio Section */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <UploadIcon className="size-4" />
          Audio
        </h3>
        <div className="pl-6 space-y-2">
          {audioFileName && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Current File
              </label>
              <div className="text-sm text-neutral-200 truncate">
                {audioFileName}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <FileDropInput
              accept="audio/*"
              data-testid="load-audio-button"
              disabled={loadAudioMutation.isPending}
              inputProps={{ "data-testid": "audio-file-input" }}
              className="h-8 flex-1 gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground data-[drag-over=true]:border-emerald-500/60 data-[drag-over=true]:bg-emerald-950/30 dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
              onFile={(file) => loadAudioMutation.mutate(file)}
            >
              <UploadIcon className="size-4" />
              {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
            </FileDropInput>
            {audioFileName && (
              <Button
                data-testid="remove-audio-button"
                onClick={handleRemoveAudio}
                className="h-8 flex-1 gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
              >
                <Trash2Icon className="size-4" />
                Remove
              </Button>
            )}
          </div>
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
            onClick={handleExportProject}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            Export Project
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
          <Button
            data-testid="export-abc-button"
            onClick={handleExportABC}
            disabled={notes.length === 0}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <DownloadIcon className="size-4" />
            Export ABC
          </Button>
          <Button
            data-testid="copy-abc-button"
            onClick={handleCopyABCToClipboard}
            disabled={notes.length === 0}
            className="h-8 w-full justify-start gap-1.5 px-3 bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50"
          >
            <ClipboardIcon className="size-4" />
            Copy ABC to Clipboard
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
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-neutral-300">Debug</span>
          </label>
        </div>
      </section>
    </div>
  );
}
