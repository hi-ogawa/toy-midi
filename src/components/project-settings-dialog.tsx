import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

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
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Project Settings"
      testId="project-settings-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
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
    </Dialog>
  );
}
