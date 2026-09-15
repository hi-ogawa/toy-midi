import { MoreVerticalIcon, Trash2Icon } from "lucide-react";
import type { MidiTrackState } from "../../lib/recorder/runtime";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { getTimelineSurfaceProps } from "./recorder-timeline";

export function MidiTrackActions({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
          title={`${label} actions`}
        >
          <MoreVerticalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRemove} className="text-red-400">
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MidiTimelineLane({
  beatsPerBar,
  notes,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
  tempo,
  onSeek,
}: {
  beatsPerBar: number;
  notes: MidiTrackState["notes"];
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
  tempo: number;
  onSeek: (position: number) => void;
}) {
  const pitches = notes.map((note) => note.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const pitchRange = Math.max(1, maxPitch - minPitch + 1);
  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      {...getTimelineSurfaceProps({
        beatsPerBar,
        onSeek,
        pixelsPerBeat,
        tempo,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
    >
      {notes.map((note) => (
        <div
          key={note.id}
          className="pointer-events-none absolute min-w-px rounded-sm bg-violet-400/75"
          style={{
            left: (note.start - viewportStartBeat) * pixelsPerBeat,
            top: `${8 + ((maxPitch - note.pitch) / pitchRange) * 32}%`,
            width: Math.max(2, note.duration * pixelsPerBeat),
            height: `${Math.max(8, 40 / pitchRange)}%`,
          }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-neutral-500">
        Piano roll coming soon
      </div>
    </div>
  );
}
