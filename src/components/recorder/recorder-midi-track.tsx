import { useMutation } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWindowEvent } from "../../hooks/use-window-event";
import { GM_PROGRAMS } from "../../lib/general-midi";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import { isBlackKey, clampPitch, snapToGrid } from "../../lib/music";
import { formatChromaticPitch } from "../../lib/pitch-spelling";
import type {
  MidiTrackState,
  RecorderRuntime,
} from "../../lib/recorder/runtime";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { MidiTrackActions, TrackRow } from "./recorder-tracks";

const KEY_HEIGHT = 18;
const PITCHES = Array.from({ length: 128 }, (_, index) => 127 - index);

export function MidiTrackRow({
  track,
  runtime,
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
  effectsOpen,
  onEffectsToggle,
  onRemove,
  onTranscribe,
  onFocus,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
  onRemove: () => void;
  onTranscribe: () => void;
  onFocus: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = track.notes.find((note) => note.id === selectedId);
  const previewPitch = useRef<number | undefined>(undefined);
  const [initialPitch] = useState(() => track.notes[0]?.pitch ?? 60);
  const programMutation = useMutation({
    mutationFn: (program: number) =>
      runtime.setMidiTrackProgram(track.id, program),
    onError: (error) => toast.error(error.message),
  });

  function stopPreview() {
    if (previewPitch.current !== undefined) {
      runtime.stopMidiNotePreview({
        id: track.id,
        pitch: previewPitch.current,
      });
      previewPitch.current = undefined;
    }
  }

  function startPreview(pitch: number) {
    stopPreview();
    previewPitch.current = pitch;
    void runtime
      .startMidiNotePreview({ id: track.id, pitch })
      .catch((error: Error) => {
        stopPreview();
        toast.error(error.message);
      });
  }

  useWindowEvent("pointerup", stopPreview);
  useWindowEvent("pointercancel", stopPreview);
  useWindowEvent("blur", stopPreview);
  useEffect(
    () => () => {
      if (previewPitch.current !== undefined) {
        runtime.stopMidiNotePreview({
          id: track.id,
          pitch: previewPitch.current,
        });
      }
    },
    [runtime, track.id],
  );

  // Vertical wheel scrolling belongs to pitches. Horizontal scrolling and Ctrl
  // zoom continue to the shared timeline handler.
  const scrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }
      element.scrollTop =
        (127 - initialPitch) * KEY_HEIGHT - element.clientHeight / 2;
      const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.shiftKey && event.deltaX === 0) {
          event.stopPropagation();
        }
      };
      element.addEventListener("wheel", handleWheel);
      return () => element.removeEventListener("wheel", handleWheel);
    },
    [initialPitch],
  );

  function deleteSelected() {
    if (!selected) {
      return;
    }
    stopPreview();
    runtime.setMidiTrackNotes(
      track.id,
      track.notes.filter((note) => note.id !== selected.id),
    );
    setSelectedId(undefined);
  }

  const grid = getTimelineGridBackground({
    beatsPerBar,
    pixelsPerBeat,
    viewportStartBeat,
    subdivisionsPerBeat,
    minimumPixelSpacing: 8,
    colors: { bar: "#737373", beat: "#454545", subdivision: "#303030" },
  });

  return (
    <div
      onFocus={onFocus}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          stopPreview();
          setSelectedId(undefined);
        }
      }}
      onKeyDown={(event) => {
        if (isShortcutTextInputTarget(event.target)) {
          return;
        }
        if (
          matchKeyboardEvent(event, "Delete") ||
          matchKeyboardEvent(event, "Backspace")
        ) {
          event.preventDefault();
          event.stopPropagation();
          deleteSelected();
        } else if (matchKeyboardEvent(event, "Escape")) {
          event.stopPropagation();
          setSelectedId(undefined);
        }
      }}
    >
      <TrackRow
        data-testid="recorder-midi-track-row"
        title={track.name}
        height={Math.max(180, track.height)}
        gain={track.gain}
        muted={track.muted}
        soloed={track.soloed}
        effectsOpen={effectsOpen}
        onEffectsToggle={onEffectsToggle}
        onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
        onMutedChange={(muted) => runtime.setTrackMix(track.id, { muted })}
        onSoloedChange={(soloed) => runtime.setTrackMix(track.id, { soloed })}
        onHeightChange={(height) => runtime.setTrackHeight(track.id, height)}
        action={
          <MidiTrackActions
            label={track.name}
            onRemove={onRemove}
            onTranscribe={onTranscribe}
          />
        }
        editor={
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain"
            data-testid="recorder-midi-pitch-scroll"
          >
            <div
              className="grid grid-cols-[15rem_minmax(0,1fr)]"
              style={{ height: 128 * KEY_HEIGHT }}
            >
              <div className="relative border-r border-neutral-600 bg-neutral-900">
                {PITCHES.map((pitch) => (
                  <button
                    key={pitch}
                    type="button"
                    aria-label={`Preview ${formatChromaticPitch(pitch)}`}
                    className={cn(
                      "absolute right-0 border-b border-neutral-500 pr-2 text-right text-[10px] active:bg-violet-400",
                      isBlackKey(pitch)
                        ? "w-12 bg-neutral-800 text-neutral-300"
                        : "w-16 bg-neutral-200 text-neutral-800",
                    )}
                    style={{
                      top: (127 - pitch) * KEY_HEIGHT,
                      height: KEY_HEIGHT,
                    }}
                    onPointerDown={(event) => {
                      if (event.button === 0) {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        startPreview(pitch);
                      }
                    }}
                    onLostPointerCapture={stopPreview}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!event.repeat) {
                          startPreview(pitch);
                        }
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        stopPreview();
                      }
                    }}
                  >
                    {formatChromaticPitch(pitch)}
                  </button>
                ))}
              </div>
              <div
                data-testid="recorder-midi-grid"
                role="group"
                aria-label={`${track.name} notes`}
                tabIndex={0}
                onLostPointerCapture={stopPreview}
                className="relative overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-400"
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.currentTarget.focus({ preventScroll: true });
                  const target = (
                    event.target as HTMLElement
                  ).closest<HTMLElement>("[data-note-id]");
                  const existing = track.notes.find(
                    (note) => note.id === target?.dataset.noteId,
                  );
                  if (existing) {
                    setSelectedId(existing.id);
                    startPreview(existing.pitch);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const pitch = clampPitch(
                    127 - Math.floor((event.clientY - rect.top) / KEY_HEIGHT),
                  );
                  const beat =
                    viewportStartBeat +
                    (event.clientX - rect.left) / pixelsPerBeat;
                  const note = {
                    id: crypto.randomUUID(),
                    pitch,
                    start: Math.max(
                      0,
                      snapToGrid(beat, 1 / subdivisionsPerBeat, {
                        floor: true,
                      }),
                    ),
                    duration: 1 / subdivisionsPerBeat,
                    velocity: 100,
                  };
                  runtime.setMidiTrackNotes(track.id, [...track.notes, note]);
                  setSelectedId(note.id);
                  startPreview(pitch);
                }}
              >
                {PITCHES.map((pitch) => (
                  <div
                    key={pitch}
                    className={cn(
                      "pointer-events-none absolute inset-x-0 border-b border-neutral-800",
                      isBlackKey(pitch) ? "bg-neutral-950" : "bg-neutral-900",
                    )}
                    style={{
                      top: (127 - pitch) * KEY_HEIGHT,
                      height: KEY_HEIGHT,
                    }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={grid}
                />
                {track.notes.map((note) => (
                  <div
                    key={note.id}
                    data-note-id={note.id}
                    aria-label={`${formatChromaticPitch(note.pitch)}, beat ${note.start + 1}`}
                    className={cn(
                      "absolute cursor-pointer overflow-hidden rounded-sm border px-1 text-[10px] text-violet-100",
                      selectedId === note.id
                        ? "border-violet-100 bg-violet-500"
                        : "border-violet-400 bg-violet-700",
                    )}
                    style={{
                      left: (note.start - viewportStartBeat) * pixelsPerBeat,
                      top: (127 - note.pitch) * KEY_HEIGHT + 1,
                      width: Math.max(2, note.duration * pixelsPerBeat),
                      height: KEY_HEIGHT - 2,
                    }}
                  >
                    {formatChromaticPitch(note.pitch)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <div className="flex min-w-0 items-center gap-4 border-b border-neutral-700 bg-neutral-900 px-3">
          <label className="flex min-w-0 items-center gap-2 text-xs text-neutral-400">
            Program
            <select
              aria-label={`${track.name} program`}
              value={track.program}
              disabled={programMutation.isPending}
              onChange={(event) =>
                programMutation.mutate(Number(event.target.value))
              }
              className="max-w-64 rounded border border-neutral-600 bg-neutral-800 p-1 text-neutral-200"
            >
              {GM_PROGRAMS.map((name, program) => (
                <option key={program} value={program}>
                  {program}: {name}
                </option>
              ))}
            </select>
          </label>
          <Button
            title="Delete selected note"
            disabled={!selected}
            onClick={deleteSelected}
            className="size-7 shrink-0"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          <span className="text-xs text-neutral-500">
            Click to add · Delete to remove · Scroll for pitch
          </span>
        </div>
      </TrackRow>
    </div>
  );
}
