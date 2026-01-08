import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isBlackKey,
  MAX_PITCH,
  midiToNoteName,
  MIN_PITCH,
  PITCH_COUNT,
  snapToGrid,
  clampPitch,
} from "../lib/music";
import { generateNoteId, useProjectStore } from "../stores/project-store";
import { GRID_SNAP_VALUES, GridSnap, Note } from "../types";

// Layout constants (exported for tests)
export const KEYBOARD_WIDTH = 60;
export const BASE_ROW_HEIGHT = 20;
export const BASE_BEAT_WIDTH = 80;
export const TIMELINE_HEIGHT = 32;
export const WAVEFORM_HEIGHT = 60;
export const BEATS_PER_BAR = 4;

// Deprecated: use scaled versions from useDimensions
export const ROW_HEIGHT = BASE_ROW_HEIGHT;
export const BEAT_WIDTH = BASE_BEAT_WIDTH;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Generate CSS background for grid
function generateGridBackground(
  beatWidth: number,
  rowHeight: number,
  gridSnap: GridSnap,
): string {
  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];
  const subBeatWidth = beatWidth * gridSnapValue;
  const barWidth = beatWidth * BEATS_PER_BAR;

  // Row backgrounds (alternating for black keys in octave pattern)
  // Pattern repeats every 12 semitones (octave)
  // Black key positions in octave: C#, D#, F#, G#, A# (indices 1, 3, 6, 8, 10)
  // We render from G3 down, so pattern starts offset. Using simple approximation.
  const rowBg = `repeating-linear-gradient(
    0deg,
    #1a1a1a 0px,
    #1a1a1a ${rowHeight}px,
    #262626 ${rowHeight}px,
    #262626 ${rowHeight * 2}px,
    #1a1a1a ${rowHeight * 2}px,
    #1a1a1a ${rowHeight * 3}px,
    #262626 ${rowHeight * 3}px,
    #262626 ${rowHeight * 4}px,
    #1a1a1a ${rowHeight * 4}px,
    #1a1a1a ${rowHeight * 5}px,
    #1a1a1a ${rowHeight * 5}px,
    #1a1a1a ${rowHeight * 6}px,
    #262626 ${rowHeight * 6}px,
    #262626 ${rowHeight * 7}px,
    #1a1a1a ${rowHeight * 7}px,
    #1a1a1a ${rowHeight * 8}px,
    #262626 ${rowHeight * 8}px,
    #262626 ${rowHeight * 9}px,
    #1a1a1a ${rowHeight * 9}px,
    #1a1a1a ${rowHeight * 10}px,
    #262626 ${rowHeight * 10}px,
    #262626 ${rowHeight * 11}px,
    #1a1a1a ${rowHeight * 11}px,
    #1a1a1a ${rowHeight * 12}px
  )`;

  // Horizontal row lines
  const rowLines = `repeating-linear-gradient(
    0deg,
    #404040 0px,
    #404040 1px,
    transparent 1px,
    transparent ${rowHeight}px
  )`;

  // Vertical sub-beat lines (grid snap)
  const subBeatLines = `repeating-linear-gradient(
    90deg,
    #333333 0px,
    #333333 1px,
    transparent 1px,
    transparent ${subBeatWidth}px
  )`;

  // Vertical beat lines
  const beatLines = `repeating-linear-gradient(
    90deg,
    #404040 0px,
    #404040 1px,
    transparent 1px,
    transparent ${beatWidth}px
  )`;

  // Vertical bar lines (every 4 beats)
  const barLines = `repeating-linear-gradient(
    90deg,
    #525252 0px,
    #525252 1px,
    transparent 1px,
    transparent ${barWidth}px
  )`;

  return `${barLines}, ${beatLines}, ${subBeatLines}, ${rowLines}, ${rowBg}`;
}

function useDimensions(zoomX: number, zoomY: number, totalBeats: number) {
  return useMemo(
    () => ({
      beatWidth: BASE_BEAT_WIDTH * zoomX,
      rowHeight: BASE_ROW_HEIGHT * zoomY,
      gridWidth: totalBeats * BASE_BEAT_WIDTH * zoomX,
      gridHeight: PITCH_COUNT * BASE_ROW_HEIGHT * zoomY,
    }),
    [zoomX, zoomY, totalBeats],
  );
}

type DragMode =
  | { type: "none" }
  | { type: "creating"; startBeat: number; pitch: number; currentBeat: number }
  | {
      type: "moving";
      noteId: string;
      startBeat: number;
      startPitch: number;
      offsetBeat: number;
      offsetPitch: number;
    }
  | {
      type: "resizing-start";
      noteId: string;
      originalStart: number;
      originalDuration: number;
    }
  | {
      type: "resizing-end";
      noteId: string;
      originalStart: number;
      originalDuration: number;
    }
  | {
      type: "box-select";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

export function PianoRoll() {
  const {
    notes,
    selectedNoteIds,
    gridSnap,
    totalBeats,
    addNote,
    updateNote,
    deleteNotes,
    selectNotes,
    deselectAll,
    setGridSnap,
  } = useProjectStore();

  const gridRef = useRef<SVGSVGElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);

  const { beatWidth, rowHeight, gridWidth, gridHeight } = useDimensions(
    zoomX,
    zoomY,
    totalBeats,
  );
  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];

  // Convert screen coordinates to grid coordinates
  const screenToGrid = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { beat: 0, pitch: MIN_PITCH };
      const rect = gridRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const beat = Math.max(0, x / beatWidth);
      const pitch = clampPitch(MAX_PITCH - Math.floor(y / rowHeight));
      return { beat, pitch };
    },
    [beatWidth, rowHeight],
  );

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNoteIds.size > 0) {
          deleteNotes(Array.from(selectedNoteIds));
        }
      } else if (e.key === "Escape") {
        deselectAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNoteIds, deleteNotes, deselectAll]);

  // Handle wheel for zoom (Ctrl+wheel)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Ctrl + wheel = horizontal zoom
      if (e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const currentIndex = ZOOM_LEVELS.indexOf(zoomX);
        const newIndex = Math.max(
          0,
          Math.min(ZOOM_LEVELS.length - 1, currentIndex + delta),
        );
        setZoomX(ZOOM_LEVELS[newIndex]);
      }
      // Ctrl + Shift + wheel = vertical zoom
      else if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const currentIndex = ZOOM_LEVELS.indexOf(zoomY);
        const newIndex = Math.max(
          0,
          Math.min(ZOOM_LEVELS.length - 1, currentIndex + delta),
        );
        setZoomY(ZOOM_LEVELS[newIndex]);
      }
      // No modifier = native scroll (horizontal and vertical)
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomX, zoomY]);

  // Handle mouse events on the grid
  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const { beat, pitch } = screenToGrid(e.clientX, e.clientY);
      const snappedBeat = snapToGrid(beat, gridSnapValue);

      // Check if clicking on a note
      const clickedNote = notes.find(
        (n) =>
          beat >= n.start && beat < n.start + n.duration && pitch === n.pitch,
      );

      if (clickedNote) {
        // Check if clicking on edges for resize
        const noteStartX = clickedNote.start * beatWidth;
        const noteEndX = (clickedNote.start + clickedNote.duration) * beatWidth;
        const clickX = beat * beatWidth;
        const edgeThreshold = 8;

        if (clickX - noteStartX < edgeThreshold) {
          // Resize from start
          setDragMode({
            type: "resizing-start",
            noteId: clickedNote.id,
            originalStart: clickedNote.start,
            originalDuration: clickedNote.duration,
          });
        } else if (noteEndX - clickX < edgeThreshold) {
          // Resize from end
          setDragMode({
            type: "resizing-end",
            noteId: clickedNote.id,
            originalStart: clickedNote.start,
            originalDuration: clickedNote.duration,
          });
        } else {
          // Select and maybe drag
          if (e.shiftKey) {
            selectNotes([clickedNote.id], false);
          } else if (!selectedNoteIds.has(clickedNote.id)) {
            selectNotes([clickedNote.id], true);
          }
          setDragMode({
            type: "moving",
            noteId: clickedNote.id,
            startBeat: clickedNote.start,
            startPitch: clickedNote.pitch,
            offsetBeat: beat - clickedNote.start,
            offsetPitch: 0,
          });
        }
      } else {
        // Start creating a new note or box select
        if (e.shiftKey) {
          // Box select
          const rect = gridRef.current!.getBoundingClientRect();
          setDragMode({
            type: "box-select",
            startX: e.clientX - rect.left,
            startY: e.clientY - rect.top,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top,
          });
        } else {
          deselectAll();
          setDragMode({
            type: "creating",
            startBeat: snappedBeat,
            pitch,
            currentBeat: snappedBeat + gridSnapValue,
          });
        }
      }
    },
    [
      notes,
      selectedNoteIds,
      gridSnapValue,
      screenToGrid,
      selectNotes,
      deselectAll,
      beatWidth,
    ],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragMode.type === "none") return;

      const { beat, pitch } = screenToGrid(e.clientX, e.clientY);

      if (dragMode.type === "creating") {
        const snappedBeat = snapToGrid(beat, gridSnapValue);
        const endBeat = Math.max(
          dragMode.startBeat + gridSnapValue,
          snappedBeat,
        );
        setDragMode({ ...dragMode, currentBeat: endBeat });
      } else if (dragMode.type === "moving") {
        const snappedBeat = snapToGrid(
          beat - dragMode.offsetBeat,
          gridSnapValue,
        );
        const newStart = Math.max(0, snappedBeat);
        const newPitch = clampPitch(pitch);
        updateNote(dragMode.noteId, { start: newStart, pitch: newPitch });
        // Update other selected notes too
        if (selectedNoteIds.size > 1) {
          const deltaStart = newStart - dragMode.startBeat;
          const deltaPitch = newPitch - dragMode.startPitch;
          selectedNoteIds.forEach((id) => {
            if (id !== dragMode.noteId) {
              const note = notes.find((n) => n.id === id);
              if (note) {
                updateNote(id, {
                  start: Math.max(0, note.start + deltaStart),
                  pitch: clampPitch(note.pitch + deltaPitch),
                });
              }
            }
          });
        }
        setDragMode({ ...dragMode, startBeat: newStart, startPitch: newPitch });
      } else if (dragMode.type === "resizing-start") {
        const snappedBeat = snapToGrid(beat, gridSnapValue);
        const originalEnd = dragMode.originalStart + dragMode.originalDuration;
        const newStart = Math.min(snappedBeat, originalEnd - gridSnapValue);
        const newDuration = originalEnd - newStart;
        if (newStart >= 0 && newDuration >= gridSnapValue) {
          updateNote(dragMode.noteId, {
            start: newStart,
            duration: newDuration,
          });
        }
      } else if (dragMode.type === "resizing-end") {
        const snappedBeat = snapToGrid(beat, gridSnapValue);
        const newDuration = Math.max(
          gridSnapValue,
          snappedBeat - dragMode.originalStart,
        );
        updateNote(dragMode.noteId, { duration: newDuration });
      } else if (dragMode.type === "box-select") {
        const rect = gridRef.current!.getBoundingClientRect();
        setDragMode({
          ...dragMode,
          currentX: e.clientX - rect.left,
          currentY: e.clientY - rect.top,
        });
      }
    },
    [dragMode, gridSnapValue, screenToGrid, updateNote, selectedNoteIds, notes],
  );

  const handleMouseUp = useCallback(() => {
    if (dragMode.type === "creating") {
      const duration = dragMode.currentBeat - dragMode.startBeat;
      if (duration >= gridSnapValue) {
        const newNote: Note = {
          id: generateNoteId(),
          pitch: dragMode.pitch,
          start: dragMode.startBeat,
          duration,
          velocity: 100,
        };
        addNote(newNote);
        selectNotes([newNote.id], true);
      }
    } else if (dragMode.type === "box-select") {
      // Find notes in the box
      const minX = Math.min(dragMode.startX, dragMode.currentX);
      const maxX = Math.max(dragMode.startX, dragMode.currentX);
      const minY = Math.min(dragMode.startY, dragMode.currentY);
      const maxY = Math.max(dragMode.startY, dragMode.currentY);

      const minBeat = minX / beatWidth;
      const maxBeat = maxX / beatWidth;
      const minPitch = MAX_PITCH - Math.floor(maxY / rowHeight);
      const maxPitch = MAX_PITCH - Math.floor(minY / rowHeight);

      const selectedIds = notes
        .filter(
          (n) =>
            n.start < maxBeat &&
            n.start + n.duration > minBeat &&
            n.pitch >= minPitch &&
            n.pitch <= maxPitch,
        )
        .map((n) => n.id);

      selectNotes(selectedIds, true);
    }
    setDragMode({ type: "none" });
  }, [
    dragMode,
    gridSnapValue,
    addNote,
    selectNotes,
    notes,
    beatWidth,
    rowHeight,
  ]);

  useEffect(() => {
    if (dragMode.type !== "none") {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragMode, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-100 select-none">
      {/* Toolbar */}
      <div className="h-12 flex items-center gap-4 px-4 border-b border-neutral-700 shrink-0">
        <span className="text-sm text-neutral-400">Grid:</span>
        <select
          value={gridSnap}
          onChange={(e) => setGridSnap(e.target.value as GridSnap)}
          className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/4T">1/4T</option>
          <option value="1/8T">1/8T</option>
          <option value="1/16T">1/16T</option>
        </select>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-neutral-400">H:</span>
          <select
            value={zoomX}
            onChange={(e) => setZoomX(Number(e.target.value))}
            className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm w-16"
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <span className="text-sm text-neutral-400">V:</span>
          <select
            value={zoomY}
            onChange={(e) => setZoomY(Number(e.target.value))}
            className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm w-16"
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </div>

        <span className="text-sm text-neutral-500 ml-auto">
          {selectedNoteIds.size > 0 && `${selectedNoteIds.size} selected`}
        </span>
      </div>

      {/* Main content area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="flex" style={{ width: KEYBOARD_WIDTH + gridWidth }}>
          {/* Left column: keyboard labels (sticky) */}
          <div
            className="shrink-0 sticky left-0 z-10 bg-neutral-900"
            style={{ width: KEYBOARD_WIDTH }}
          >
            {/* Timeline spacer */}
            <div style={{ height: TIMELINE_HEIGHT }} />
            {/* Waveform spacer */}
            <div
              className="border-b border-neutral-700 flex items-center justify-center text-xs text-neutral-500"
              style={{ height: WAVEFORM_HEIGHT }}
            >
              Audio
            </div>
            {/* Piano keyboard */}
            <Keyboard rowHeight={rowHeight} />
          </div>

          {/* Right column: timeline, waveform, grid */}
          <div className="flex flex-col">
            {/* Timeline */}
            <Timeline
              beatWidth={beatWidth}
              gridWidth={gridWidth}
              totalBeats={totalBeats}
            />
            {/* Waveform placeholder */}
            <div
              className="bg-neutral-800 border-b border-neutral-700"
              style={{ height: WAVEFORM_HEIGHT }}
            />
            {/* Note grid with CSS background */}
            <svg
              ref={gridRef}
              data-testid="piano-roll-grid"
              width={gridWidth}
              height={gridHeight}
              className="cursor-crosshair"
              onMouseDown={handleGridMouseDown}
              style={{
                background: generateGridBackground(
                  beatWidth,
                  rowHeight,
                  gridSnap,
                ),
              }}
            >
              {/* Notes */}
              {notes.map((note) => (
                <NoteRect
                  key={note.id}
                  note={note}
                  selected={selectedNoteIds.has(note.id)}
                  beatWidth={beatWidth}
                  rowHeight={rowHeight}
                />
              ))}
              {/* Preview note while creating */}
              {dragMode.type === "creating" && (
                <rect
                  x={dragMode.startBeat * beatWidth}
                  y={(MAX_PITCH - dragMode.pitch) * rowHeight}
                  width={
                    (dragMode.currentBeat - dragMode.startBeat) * beatWidth
                  }
                  height={rowHeight}
                  fill="#3b82f6"
                  opacity={0.5}
                  rx={2}
                />
              )}
              {/* Box select rectangle */}
              {dragMode.type === "box-select" && (
                <rect
                  x={Math.min(dragMode.startX, dragMode.currentX)}
                  y={Math.min(dragMode.startY, dragMode.currentY)}
                  width={Math.abs(dragMode.currentX - dragMode.startX)}
                  height={Math.abs(dragMode.currentY - dragMode.startY)}
                  fill="#3b82f6"
                  opacity={0.2}
                  stroke="#3b82f6"
                  strokeWidth={1}
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Keyboard({ rowHeight }: { rowHeight: number }) {
  const rows = [];
  for (let pitch = MAX_PITCH; pitch >= MIN_PITCH; pitch--) {
    const black = isBlackKey(pitch);
    rows.push(
      <div
        key={pitch}
        className={`flex items-center justify-end pr-2 text-xs border-b border-neutral-700 ${
          black
            ? "bg-neutral-800 text-neutral-400"
            : "bg-neutral-700 text-neutral-200"
        }`}
        style={{ height: rowHeight }}
      >
        {midiToNoteName(pitch)}
      </div>,
    );
  }
  return <div>{rows}</div>;
}

function Timeline({
  beatWidth,
  gridWidth,
  totalBeats,
}: {
  beatWidth: number;
  gridWidth: number;
  totalBeats: number;
}) {
  const markers = [];

  for (let beat = 0; beat <= totalBeats; beat++) {
    const isBar = beat % BEATS_PER_BAR === 0;
    if (isBar) {
      const barNumber = beat / BEATS_PER_BAR + 1;
      markers.push(
        <div
          key={beat}
          className="absolute text-xs text-neutral-400"
          style={{ left: beat * beatWidth, top: 8 }}
        >
          {barNumber}
        </div>,
      );
    }
  }

  return (
    <div
      className="relative bg-neutral-850 border-b border-neutral-700"
      style={{ height: TIMELINE_HEIGHT, width: gridWidth }}
    >
      {markers}
    </div>
  );
}

function NoteRect({
  note,
  selected,
  beatWidth,
  rowHeight,
}: {
  note: Note;
  selected: boolean;
  beatWidth: number;
  rowHeight: number;
}) {
  const x = note.start * beatWidth;
  const y = (MAX_PITCH - note.pitch) * rowHeight;
  const width = note.duration * beatWidth;

  return (
    <g data-testid={`note-${note.id}`} data-selected={selected}>
      <rect
        x={x}
        y={y + 1}
        width={width}
        height={rowHeight - 2}
        fill={selected ? "#60a5fa" : "#3b82f6"}
        stroke={selected ? "#93c5fd" : "#2563eb"}
        strokeWidth={selected ? 2 : 1}
        rx={2}
        style={{ cursor: "move" }}
      />
      {/* Resize handles (visible on hover/selection) */}
      {selected && (
        <>
          <rect
            x={x}
            y={y}
            width={6}
            height={rowHeight}
            fill="transparent"
            style={{ cursor: "ew-resize" }}
          />
          <rect
            x={x + width - 6}
            y={y}
            width={6}
            height={rowHeight}
            fill="transparent"
            style={{ cursor: "ew-resize" }}
          />
        </>
      )}
    </g>
  );
}
