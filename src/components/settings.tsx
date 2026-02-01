import { useMutation } from "@tanstack/react-query";
import {
  ClipboardIcon,
  DownloadIcon,
  FolderIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useDraftTextInput } from "../hooks/use-draft-text-input";
import {
  copyABCToClipboard,
  downloadABCFile,
  exportABC,
} from "../lib/abc-export";
import { deleteAsset, saveAsset } from "../lib/asset-store";
import { audioManager, loadAudioFile } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { importMidiNotes, type MidiImportOptions } from "../lib/midi-import";
import { downloadProjectFile, exportProjectFile } from "../lib/project-file";
import { toSavedProject, useProjectStore } from "../stores/project-store";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const midiFileInputRef = useRef<HTMLInputElement>(null);

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

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAudioMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleImportMidiClick = () => {
    midiFileInputRef.current?.click();
  };

  const handleMidiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMidiMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

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
      trackName: audioFileName
        ? audioFileName.replace(/\.[^.]+$/, "")
        : "Piano Roll",
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, "-")
      .replace(/\.\d+Z$/, "");
    const fileName = `toy-midi-export-${timestamp}.mid`;

    downloadMidiFile(midiData, fileName);
  };

  const handleExportABC = () => {
    const abcText = exportABC({
      notes,
      tempo,
      timeSignature,
      title: audioFileName ? audioFileName.replace(/\.[^.]+$/, "") : "Untitled",
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, "-")
      .replace(/\.\d+Z$/, "");
    const fileName = `toy-midi-export-${timestamp}.abc`;

    downloadABCFile(abcText, fileName);
  };

  const handleCopyABCToClipboard = async () => {
    try {
      const abcText = exportABC({
        notes,
        tempo,
        timeSignature,
        title: audioFileName
          ? audioFileName.replace(/\.[^.]+$/, "")
          : "Untitled",
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
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={midiFileInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleMidiFileChange}
        className="hidden"
      />

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
            variant="outline"
            size="sm"
            onClick={onProjectsClick}
            className="w-full justify-start"
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
            <Button
              data-testid="load-audio-button"
              variant="outline"
              size="sm"
              onClick={handleLoadClick}
              disabled={loadAudioMutation.isPending}
              className="flex-1"
            >
              <UploadIcon className="size-4" />
              {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
            </Button>
            {audioFileName && (
              <Button
                data-testid="remove-audio-button"
                variant="outline"
                size="sm"
                onClick={handleRemoveAudio}
                className="flex-1"
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
          <Button
            data-testid="import-midi-button"
            variant="outline"
            size="sm"
            onClick={handleImportMidiClick}
            disabled={importMidiMutation.isPending}
            className="w-full justify-start"
          >
            <UploadIcon className="size-4" />
            {importMidiMutation.isPending ? "Importing..." : "Import MIDI File"}
          </Button>
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
            variant="outline"
            size="sm"
            onClick={handleExportProject}
            className="w-full justify-start"
          >
            <DownloadIcon className="size-4" />
            Export Project
          </Button>
          <Button
            data-testid="export-midi-button"
            variant="outline"
            size="sm"
            onClick={handleExportMidi}
            disabled={notes.length === 0}
            className="w-full justify-start"
          >
            <DownloadIcon className="size-4" />
            Export MIDI
          </Button>
          <Button
            data-testid="export-abc-button"
            variant="outline"
            size="sm"
            onClick={handleExportABC}
            disabled={notes.length === 0}
            className="w-full justify-start"
          >
            <DownloadIcon className="size-4" />
            Export ABC
          </Button>
          <Button
            data-testid="copy-abc-button"
            variant="outline"
            size="sm"
            onClick={handleCopyABCToClipboard}
            disabled={notes.length === 0}
            className="w-full justify-start"
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
              Auto-scroll{" "}
              <span className="text-xs text-neutral-500">(Ctrl+F)</span>
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
