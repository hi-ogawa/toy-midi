import { useMutation } from "@tanstack/react-query";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  copyABCToClipboard,
  downloadABCFile,
  exportABC,
} from "../lib/abc-export";
import { deleteAsset, saveAsset } from "../lib/asset-store";
import { audioManager, loadAudioFile } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import {
  isMidiFile,
  importMidiNotes,
  parseMidiFile,
  type MidiImportOptions,
  type ParsedMidi,
} from "../lib/midi-import";
import {
  downloadProjectFile,
  exportProjectFile,
  importProjectAudio,
  parseProjectFile,
} from "../lib/project-file";
import {
  createProject,
  getProjectMetadata,
  saveProjectData,
} from "../lib/project-manager";
import {
  generateNoteId,
  toSavedProject,
  useProjectStore,
} from "../stores/project-store";
import { Button } from "./ui/button";

type Tab = "export" | "import";
type ExportFormat = "project" | "midi" | "abc";

type ImportExportModalProps = {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onProjectImported: (projectId: string) => void;
};

export function ImportExportModal({
  isOpen,
  projectId,
  onClose,
  onProjectImported,
}: ImportExportModalProps) {
  const [tab, setTab] = useState<Tab>("export");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("project");

  // Import state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedMidi, setParsedMidi] = useState<ParsedMidi | null>(null);
  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>(
    [],
  );
  const [midiReplaceMode, setMidiReplaceMode] = useState<"replace" | "append">(
    "replace",
  );
  const [importTempo, setImportTempo] = useState(true);
  const [importTimeSignature, setImportTimeSignature] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const store = useProjectStore();
  const projectMeta = getProjectMetadata(projectId);

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const projectData = toSavedProject(store);
      const projectName = projectMeta?.name || "Untitled";

      if (exportFormat === "project") {
        const blob = await exportProjectFile(projectName, projectData);
        downloadProjectFile(blob, projectName);
      } else if (exportFormat === "midi") {
        const midiData = exportMidi({
          notes: store.notes,
          tempo: store.tempo,
          timeSignature: store.timeSignature,
          trackName: projectName,
        });
        const timestamp = new Date()
          .toISOString()
          .replace(/[T:]/g, "-")
          .replace(/\.\d+Z$/, "");
        downloadMidiFile(midiData, `${projectName}-${timestamp}.mid`);
      } else if (exportFormat === "abc") {
        const abcText = exportABC({
          notes: store.notes,
          tempo: store.tempo,
          timeSignature: store.timeSignature,
          title: projectName,
        });
        const timestamp = new Date()
          .toISOString()
          .replace(/[T:]/g, "-")
          .replace(/\.\d+Z$/, "");
        downloadABCFile(abcText, `${projectName}-${timestamp}.abc`);
      }
    },
    onSuccess: () => {
      toast.success(
        exportFormat === "project"
          ? "Project exported"
          : exportFormat === "midi"
            ? "MIDI exported"
            : "ABC exported",
      );
      onClose();
    },
    onError: (error) => {
      console.error("Export failed:", error);
      toast.error("Export failed");
    },
  });

  // Copy ABC to clipboard
  const handleCopyABC = async () => {
    try {
      const abcText = exportABC({
        notes: store.notes,
        tempo: store.tempo,
        timeSignature: store.timeSignature,
        title: projectMeta?.name || "Untitled",
      });
      await copyABCToClipboard(abcText);
      toast.success("ABC notation copied to clipboard");
    } catch (error) {
      console.error("Copy failed:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setParsedMidi(null);
    setSelectedTrackIndices([]);

    // Parse MIDI files to show track info
    if (isMidiFile(file)) {
      try {
        const parsed = await parseMidiFile(file);
        setParsedMidi(parsed);
        // Select all tracks by default
        setSelectedTrackIndices(parsed.tracks.map((t) => t.index));
      } catch (error) {
        console.error("Failed to parse MIDI:", error);
        toast.error("Failed to parse MIDI file");
        setSelectedFile(null);
      }
    }
  }, []);

  // File drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = "";
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");

      const ext = selectedFile.name.split(".").pop()?.toLowerCase();

      // Handle .toymidi project files
      if (ext === "toymidi") {
        const parsed = await parseProjectFile(selectedFile);
        const projectWithAudio = await importProjectAudio(parsed);

        // Create new project
        const newProjectId = createProject(parsed.manifest.name);
        saveProjectData(newProjectId, projectWithAudio);

        return { type: "project" as const, projectId: newProjectId };
      }

      // Handle MIDI files
      if (isMidiFile(selectedFile)) {
        if (selectedTrackIndices.length === 0) {
          throw new Error("No tracks selected");
        }

        const options: MidiImportOptions = {
          trackIndices: selectedTrackIndices,
          replaceExisting: midiReplaceMode === "replace",
          importTempo,
          importTimeSignature,
        };

        const result = await importMidiNotes(selectedFile, options);

        // Apply to current project
        if (options.replaceExisting) {
          // Replace all notes
          useProjectStore.setState({ notes: result.notes });
        } else {
          // Append notes (regenerate IDs to avoid conflicts)
          const newNotes = result.notes.map((n) => ({
            ...n,
            id: generateNoteId(),
          }));
          useProjectStore.setState((state) => ({
            notes: [...state.notes, ...newNotes],
          }));
        }

        // Apply tempo and time signature if requested
        if (result.tempo) {
          store.setTempo(result.tempo);
        }
        if (result.timeSignature) {
          store.setTimeSignature(result.timeSignature);
        }

        return { type: "midi" as const, noteCount: result.notes.length };
      }

      // Handle audio files
      if (
        selectedFile.type.startsWith("audio/") ||
        ["wav", "mp3", "ogg", "m4a"].includes(ext || "")
      ) {
        const { buffer, peaks, peaksPerSecond } =
          await loadAudioFile(selectedFile);

        // Delete old audio if exists
        if (store.audioAssetKey) {
          await deleteAsset(store.audioAssetKey);
        }

        // Save new audio
        const assetKey = await saveAsset(selectedFile);
        store.setAudioFile(selectedFile.name, buffer.duration, assetKey);

        audioManager.player.buffer = buffer;
        audioManager.player.sync().start(0);
        store.setAudioOffset(0);
        store.setAudioPeaks(peaks, peaksPerSecond);

        return { type: "audio" as const, fileName: selectedFile.name };
      }

      throw new Error("Unsupported file type");
    },
    onSuccess: (result) => {
      if (result.type === "project") {
        toast.success("Project imported");
        onProjectImported(result.projectId);
      } else if (result.type === "midi") {
        toast.success(`Imported ${result.noteCount} notes`);
        onClose();
      } else if (result.type === "audio") {
        toast.success(`Loaded audio: ${result.fileName}`);
        onClose();
      }
    },
    onError: (error) => {
      console.error("Import failed:", error);
      toast.error(error instanceof Error ? error.message : "Import failed");
    },
  });

  // Reset import state when closing or switching tabs
  const resetImportState = () => {
    setSelectedFile(null);
    setParsedMidi(null);
    setSelectedTrackIndices([]);
    setMidiReplaceMode("replace");
    setImportTempo(true);
    setImportTimeSignature(true);
  };

  const handleClose = () => {
    resetImportState();
    onClose();
  };

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === "export") {
      resetImportState();
    }
  };

  if (!isOpen) return null;

  const fileTypeLabel = selectedFile
    ? isMidiFile(selectedFile)
      ? "MIDI"
      : selectedFile.name.endsWith(".toymidi")
        ? "Project"
        : "Audio"
    : null;

  return (
    <div
      data-testid="import-export-modal"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-neutral-100">
            Import / Export
          </h2>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-neutral-700">
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              tab === "export"
                ? "text-neutral-100 border-b-2 border-neutral-100"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            onClick={() => handleTabChange("export")}
          >
            <DownloadIcon className="inline-block size-4 mr-2 -mt-0.5" />
            Export
          </button>
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              tab === "import"
                ? "text-neutral-100 border-b-2 border-neutral-100"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            onClick={() => handleTabChange("import")}
          >
            <UploadIcon className="inline-block size-4 mr-2 -mt-0.5" />
            Import
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === "export" && (
            <div className="space-y-4">
              {/* Format selection */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Format
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded border border-neutral-600 hover:border-neutral-500 cursor-pointer">
                    <input
                      type="radio"
                      name="export-format"
                      value="project"
                      checked={exportFormat === "project"}
                      onChange={() => setExportFormat("project")}
                      className="accent-neutral-100"
                    />
                    <div>
                      <div className="text-sm text-neutral-100">
                        Project (.toymidi)
                      </div>
                      <div className="text-xs text-neutral-400">
                        Complete project with audio - can be re-imported
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded border border-neutral-600 hover:border-neutral-500 cursor-pointer">
                    <input
                      type="radio"
                      name="export-format"
                      value="midi"
                      checked={exportFormat === "midi"}
                      onChange={() => setExportFormat("midi")}
                      className="accent-neutral-100"
                    />
                    <div>
                      <div className="text-sm text-neutral-100">
                        MIDI (.mid)
                      </div>
                      <div className="text-xs text-neutral-400">
                        Standard MIDI file - import into any DAW
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded border border-neutral-600 hover:border-neutral-500 cursor-pointer">
                    <input
                      type="radio"
                      name="export-format"
                      value="abc"
                      checked={exportFormat === "abc"}
                      onChange={() => setExportFormat("abc")}
                      className="accent-neutral-100"
                    />
                    <div>
                      <div className="text-sm text-neutral-100">
                        ABC Notation (.abc)
                      </div>
                      <div className="text-xs text-neutral-400">
                        Text-based notation - useful for LLMs
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Summary */}
              <div className="text-sm text-neutral-400 bg-neutral-900 rounded p-3">
                <div>Notes: {store.notes.length}</div>
                {store.audioFileName && <div>Audio: {store.audioFileName}</div>}
                <div>
                  Tempo: {store.tempo} BPM &middot;{" "}
                  {store.timeSignature.numerator}/
                  {store.timeSignature.denominator}
                </div>
              </div>
            </div>
          )}

          {tab === "import" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-neutral-400 bg-neutral-700/50"
                    : "border-neutral-600 hover:border-neutral-500"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".toymidi,.mid,.midi,.wav,.mp3,.ogg,.m4a,audio/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <UploadIcon className="size-8 mx-auto mb-3 text-neutral-500" />
                <div className="text-sm text-neutral-300">
                  Drop file here or click to browse
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  .toymidi, .mid, .wav, .mp3
                </div>
              </div>

              {/* Selected file info */}
              {selectedFile && (
                <div className="bg-neutral-900 rounded p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-neutral-100 font-medium truncate">
                      {selectedFile.name}
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-neutral-700 rounded text-neutral-300">
                      {fileTypeLabel}
                    </span>
                  </div>

                  {/* MIDI-specific options */}
                  {parsedMidi && (
                    <div className="space-y-3 pt-2 border-t border-neutral-700">
                      <div className="text-xs text-neutral-400">
                        {parsedMidi.tracks.length} track(s) &middot;{" "}
                        {parsedMidi.tempo} BPM &middot;{" "}
                        {parsedMidi.timeSignature.numerator}/
                        {parsedMidi.timeSignature.denominator}
                      </div>

                      {/* Track selection */}
                      {parsedMidi.tracks.length > 1 && (
                        <div>
                          <label className="block text-xs text-neutral-400 mb-1">
                            Tracks to import
                          </label>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {parsedMidi.tracks.map((track) => (
                              <label
                                key={track.index}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTrackIndices.includes(
                                    track.index,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTrackIndices([
                                        ...selectedTrackIndices,
                                        track.index,
                                      ]);
                                    } else {
                                      setSelectedTrackIndices(
                                        selectedTrackIndices.filter(
                                          (i) => i !== track.index,
                                        ),
                                      );
                                    }
                                  }}
                                  className="accent-neutral-100"
                                />
                                <span className="text-neutral-200">
                                  {track.name}
                                </span>
                                <span className="text-neutral-500 text-xs">
                                  ({track.noteCount} notes)
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Replace/Append */}
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="midi-mode"
                            checked={midiReplaceMode === "replace"}
                            onChange={() => setMidiReplaceMode("replace")}
                            className="accent-neutral-100"
                          />
                          <span className="text-neutral-200">
                            Replace notes
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="midi-mode"
                            checked={midiReplaceMode === "append"}
                            onChange={() => setMidiReplaceMode("append")}
                            className="accent-neutral-100"
                          />
                          <span className="text-neutral-200">Append notes</span>
                        </label>
                      </div>

                      {/* Import options */}
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={importTempo}
                            onChange={(e) => setImportTempo(e.target.checked)}
                            className="accent-neutral-100"
                          />
                          <span className="text-neutral-200">
                            Import tempo ({parsedMidi.tempo} BPM)
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={importTimeSignature}
                            onChange={(e) =>
                              setImportTimeSignature(e.target.checked)
                            }
                            className="accent-neutral-100"
                          />
                          <span className="text-neutral-200">
                            Import time sig
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Project file info */}
                  {selectedFile.name.endsWith(".toymidi") && (
                    <div className="text-xs text-neutral-400 pt-2 border-t border-neutral-700">
                      This will create a new project
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-700 px-6 py-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          {tab === "export" && (
            <>
              {exportFormat === "abc" && (
                <Button
                  variant="outline"
                  onClick={handleCopyABC}
                  disabled={store.notes.length === 0}
                >
                  Copy to Clipboard
                </Button>
              )}
              <Button
                onClick={() => exportMutation.mutate()}
                disabled={
                  exportMutation.isPending ||
                  (exportFormat !== "project" && store.notes.length === 0)
                }
              >
                {exportMutation.isPending ? "Exporting..." : "Download"}
              </Button>
            </>
          )}
          {tab === "import" && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={
                importMutation.isPending ||
                !selectedFile ||
                (parsedMidi !== null && selectedTrackIndices.length === 0)
              }
            >
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
