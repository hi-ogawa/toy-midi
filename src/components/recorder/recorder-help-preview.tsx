import { useState } from "react";
import { Button } from "../ui/button";
import { RecorderHelp } from "./help";

export function RecorderHelpPreview() {
  const [isOpen, setIsOpen] = useState(true);

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
