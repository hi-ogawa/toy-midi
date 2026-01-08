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
export const VISIBLE_BARS = 8;
export const BEATS_PER_BAR = 4;
export const TOTAL_BEATS = VISIBLE_BARS * BEATS_PER_BAR;

// Deprecated: use scaled versions from useDimensions
export const ROW_HEIGHT = BASE_ROW_HEIGHT;
export const BEAT_WIDTH = BASE_BEAT_WIDTH;
export const GRID_WIDTH = TOTAL_BEATS * BASE_BEAT_WIDTH;
export const GRID_HEIGHT = PITCH_COUNT * BASE_ROW_HEIGHT;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function useDimensions(zoomX: number, zoomY: number) {
  return useMemo(
    () => ({
      beatWidth: BASE_BEAT_WIDTH * zoomX,
      rowHeight: BASE_ROW_HEIGHT * zoomY,
      gridWidth: TOTAL_BEATS * BASE_BEAT_WIDTH * zoomX,
      gridHeight: PITCH_COUNT * BASE_ROW_HEIGHT * zoomY,
    }),
    [zoomX, zoomY],
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
    addNote,
    updateNote,
    deleteNotes,
    selectNotes,
    deselectAll,
    setGridSnap,
  } = useProjectStore();

  const gridRef = useRef<SVGSVGElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);

  const { beatWidth, rowHeight, gridWidth, gridHeight } = useDimensions(
    zoomX,
    zoomY,
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
      <div className="flex-1 overflow-auto">
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
            <Timeline beatWidth={beatWidth} gridWidth={gridWidth} />
            {/* Waveform placeholder */}
            <div
              className="bg-neutral-800 border-b border-neutral-700"
              style={{ height: WAVEFORM_HEIGHT }}
            />
            {/* Note grid */}
            <svg
              ref={gridRef}
              data-testid="piano-roll-grid"
              width={gridWidth}
              height={gridHeight}
              className="cursor-crosshair"
              onMouseDown={handleGridMouseDown}
            >
              <Grid
                gridSnap={gridSnap}
                beatWidth={beatWidth}
                rowHeight={rowHeight}
                gridWidth={gridWidth}
                gridHeight={gridHeight}
              />
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
}: {
  beatWidth: number;
  gridWidth: number;
}) {
  const markers = [];

  for (let beat = 0; beat <= TOTAL_BEATS; beat++) {
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

function Grid({
  gridSnap,
  beatWidth,
  rowHeight,
  gridWidth,
  gridHeight,
}: {
  gridSnap: GridSnap;
  beatWidth: number;
  rowHeight: number;
  gridWidth: number;
  gridHeight: number;
}) {
  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];
  const lines = [];

  // Horizontal lines (pitch rows)
  for (let i = 0; i <= PITCH_COUNT; i++) {
    const pitch = MAX_PITCH - i;
    const black = i < PITCH_COUNT && isBlackKey(pitch);
    lines.push(
      <rect
        key={`row-${i}`}
        x={0}
        y={i * rowHeight}
        width={gridWidth}
        height={rowHeight}
        fill={black ? "#262626" : "#1a1a1a"}
      />,
    );
    lines.push(
      <line
        key={`hline-${i}`}
        x1={0}
        y1={i * rowHeight}
        x2={gridWidth}
        y2={i * rowHeight}
        stroke="#404040"
        strokeWidth={0.5}
      />,
    );
  }

  // Vertical lines (beat divisions)
  const totalGridLines = TOTAL_BEATS / gridSnapValue;
  for (let i = 0; i <= totalGridLines; i++) {
    const beat = i * gridSnapValue;
    const isBar = beat % BEATS_PER_BAR === 0;
    const isBeat = beat % 1 === 0;
    lines.push(
      <line
        key={`vline-${i}`}
        x1={beat * beatWidth}
        y1={0}
        x2={beat * beatWidth}
        y2={gridHeight}
        stroke={isBar ? "#525252" : isBeat ? "#404040" : "#333333"}
        strokeWidth={isBar ? 1 : 0.5}
      />,
    );
  }

  return <g>{lines}</g>;
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
