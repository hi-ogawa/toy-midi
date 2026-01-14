import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

type ProjectSettingsDialogProps = {
  isOpen: boolean;
  projectName: string;
  onSave: (name: string) => void;
  onClose: () => void;
};

export function ProjectSettingsDialog({
  isOpen,
  projectName,
  onSave,
  onClose,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setName(projectName);
      // Focus and select on next frame
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isOpen, projectName]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== projectName) {
      onSave(trimmed);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      data-testid="project-settings-dialog"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-neutral-100">
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label
              htmlFor="project-name"
              className="block text-sm font-medium text-neutral-300 mb-2"
            >
              Project Name
            </label>
            <input
              ref={inputRef}
              id="project-name"
              data-testid="project-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-10 px-3 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
              placeholder="Enter project name"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-700 px-6 py-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
