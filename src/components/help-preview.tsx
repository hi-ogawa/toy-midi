import { useState } from "react";
import { Help } from "./help";
import { Button } from "./ui/button";

export function HelpPreview() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        onClick={() => setIsOpen(true)}
      >
        Open recorder help
      </Button>
      <Help isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
