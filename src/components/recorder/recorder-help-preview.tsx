import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { RecorderHelp } from "./help";

export function RecorderHelpPreview() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative isolate h-[720px] w-full overflow-hidden rounded-lg border border-neutral-700 p-4 [contain:layout]">
      <Button
        className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        onClick={() => setIsOpen(true)}
      >
        Open recorder help
      </Button>
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Editor quick reference"
        size="wide"
      >
        <RecorderHelp />
      </Dialog>
    </div>
  );
}
