import { useState } from "react";
import { RecorderHelp } from "./help";
import { Button } from "./ui/button";

export function RecorderHelpPreview() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        onClick={() => setIsOpen(true)}
      >
        Open recorder help
      </Button>
      <RecorderHelp isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
