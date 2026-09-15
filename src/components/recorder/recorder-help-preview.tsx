import { Button } from "../ui/button";
import { RecorderHelp } from "./help";

export function RecorderHelpPreview() {
  return (
    <div className="relative isolate h-[720px] w-full overflow-hidden rounded-lg border border-neutral-700 p-4 [contain:layout]">
      <RecorderHelp
        trigger={
          <Button className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700">
            Open recorder help
          </Button>
        }
      />
    </div>
  );
}
