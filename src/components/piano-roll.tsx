import { useCallback, useEffect, useRef, useState } from "react";
import {
  isBlackKey,
  MAX_PITCH,
  midiToNoteName,
  MIN_PITCH,
  snapToGrid,
  clampPitch,
  DEFAULT_VIEW_MAX_PITCH,
} from "../lib/music";
import { generateNoteId, useProjectStore } from "../stores/project-store";
import { GRID_SNAP_VALUES, GridSnap, Note } from "../types";

// Layout constants (exported for tests)
export const KEYBOARD_WIDTH = 60;
export const TIMELINE_HEIGHT = 32;
export const WAVEFORM_HEIGHT = 60;
export const BEATS_PER_BAR = 4;

// Default zoom levels (pixels per beat/key)
const DEFAULT_PIXELS_PER_BEAT = 80;
const DEFAULT_PIXELS_PER_KEY = 20;
const MIN_PIXELS_PER_BEAT = 20;
const MAX_PIXELS_PER_BEAT = 200;
const MIN_PIXELS_PER_KEY = 10;
const MAX_PIXELS_PER_KEY = 40;

// Deprecated: kept for E2E test compatibility
export const BASE_ROW_HEIGHT = DEFAULT_PIXELS_PER_KEY;
export const BASE_BEAT_WIDTH = DEFAULT_PIXELS_PER_BEAT;
export const ROW_HEIGHT = DEFAULT_PIXELS_PER_KEY;
export const BEAT_WIDTH = DEFAULT_PIXELS_PER_BEAT;

// Generate CSS background for grid (returns style object)
function generateGridBackground(
  pixelsPerBeat: number,
  pixelsPerKey: number,
  gridSnap: GridSnap,
  scrollX: number,
  scrollY: number,
): React.CSSProperties {
  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];
  const subBeatWidth = pixelsPerBeat * gridSnapValue;
  const barWidth = pixelsPerBeat * BEATS_PER_BAR;
  const octaveHeight = pixelsPerKey * 12;

  // Horizontal row lines (at bottom of each row to match keyboard border-bottom)
  const rowLines = `repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent ${pixelsPerKey - 1}px,
    #404040 ${pixelsPerKey - 1}px,
    #404040 ${pixelsPerKey}px
  )`;

  // Octave lines (brighter line between B and C, every 12 rows)
  const octaveLines = `repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent ${octaveHeight - 1}px,
    #666666 ${octaveHeight - 1}px,
    #666666 ${octaveHeight}px
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
    transparent ${pixelsPerBeat}px
  )`;

  // Vertical bar lines (every 4 beats)
  const barLines = `repeating-linear-gradient(
    90deg,
    #525252 0px,
    #525252 1px,
    transparent 1px,
    transparent ${barWidth}px
  )`;

  // Calculate background offset based on scroll position
  const offsetX = -(scrollX * pixelsPerBeat) % barWidth;
  const rowOffsetY = -(scrollY % 1) * pixelsPerKey; // Fractional scroll offset

  // Octave line offset: line should be at bottom of C rows (between B and C)
  // Top pitch is MAX_PITCH - scrollY, C is at pitch % 12 === 0
  // Distance from top to first B/C boundary (bottom of C row)
  const topPitch = MAX_PITCH - scrollY;
  const rowsToFirstC = ((Math.floor(topPitch) % 12) + 12) % 12; // Handle any pitch
  const octaveOffsetY = rowOffsetY + (rowsToFirstC + 1) * pixelsPerKey;

  // background-position for each layer
  const positions = [
    `${offsetX}px 0`, // barLines
    `${offsetX}px 0`, // beatLines
    `${offsetX}px 0`, // subBeatLines
    `0 ${octaveOffsetY}px`, // octaveLines
    `0 ${rowOffsetY}px`, // rowLines
  ].join(", ");

  return {
    backgroundColor: "#1a1a1a",
    backgroundImage: `${barLines}, ${beatLines}, ${subBeatLines}, ${octaveLines}, ${rowLines}`,
    backgroundPosition: positions,
  };
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });

  // Viewport state: scroll position (in beats/semitones) and zoom (pixels per unit)
  const [scrollX, setScrollX] = useState(0); // leftmost visible beat
  // Start with bass range in view (G3 at top)
  const [scrollY, setScrollY] = useState(MAX_PITCH - DEFAULT_VIEW_MAX_PITCH);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(DEFAULT_PIXELS_PER_BEAT);
  const [pixelsPerKey, setPixelsPerKey] = useState(DEFAULT_PIXELS_PER_KEY);

  // Track viewport size
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 400 });

  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];

  // Update viewport size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Calculate visible range
  const visibleBeats = viewportSize.width / pixelsPerBeat;
  const visibleKeys = viewportSize.height / pixelsPerKey;

  // Convert screen coordinates to grid coordinates (beat, pitch)
  const screenToGrid = useCallback(
    (clientX: number, clientY: number) => {
      if (!gridRef.current) return { beat: 0, pitch: MIN_PITCH };
      const rect = gridRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Convert screen position to content position using scroll offset
      const beat = Math.max(0, x / pixelsPerBeat + scrollX);
      const pitch = clampPitch(
        MAX_PITCH - scrollY - Math.floor(y / pixelsPerKey),
      );
      return { beat, pitch };
    },
    [pixelsPerBeat, pixelsPerKey, scrollX, scrollY],
  );

  // Convert content coordinates (beat, pitch) to screen pixels
  const gridToScreen = useCallback(
    (beat: number, pitch: number) => {
      const x = (beat - scrollX) * pixelsPerBeat;
      const y = (MAX_PITCH - scrollY - pitch) * pixelsPerKey;
      return { x, y };
    },
    [pixelsPerBeat, pixelsPerKey, scrollX, scrollY],
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

  // Handle wheel for pan/zoom (2D: both deltaX and deltaY)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - KEYBOARD_WIDTH;
      const mouseY = e.clientY - rect.top - TIMELINE_HEIGHT - WAVEFORM_HEIGHT;

      // Ctrl + wheel = zoom (both axes, centered on cursor)
      if (e.ctrlKey) {
        // Horizontal zoom (deltaX or deltaY for single-axis scroll devices)
        if (e.deltaX !== 0 || e.deltaY !== 0) {
          // Use deltaY for horizontal zoom (more common scroll direction)
          const hZoomFactor = e.deltaY > 0 ? 0.9 : e.deltaY < 0 ? 1.1 : 1;
          // Use deltaX for vertical zoom (horizontal scroll)
          const vZoomFactor = e.deltaX > 0 ? 0.9 : e.deltaX < 0 ? 1.1 : 1;

          if (hZoomFactor !== 1) {
            const newPixelsPerBeat = Math.max(
              MIN_PIXELS_PER_BEAT,
              Math.min(MAX_PIXELS_PER_BEAT, pixelsPerBeat * hZoomFactor),
            );
            // Zoom around mouse position horizontally
            const beatAtMouse = mouseX / pixelsPerBeat + scrollX;
            const newMouseX = (beatAtMouse - scrollX) * newPixelsPerBeat;
            const newScrollX = Math.max(
              0,
              scrollX + (mouseX - newMouseX) / newPixelsPerBeat,
            );
            setPixelsPerBeat(newPixelsPerBeat);
            setScrollX(newScrollX);
          }

          if (vZoomFactor !== 1) {
            const newPixelsPerKey = Math.max(
              MIN_PIXELS_PER_KEY,
              Math.min(MAX_PIXELS_PER_KEY, pixelsPerKey * vZoomFactor),
            );
            // Zoom around mouse position vertically
            const keyAtMouse = mouseY / pixelsPerKey + scrollY;
            const newMouseY = (keyAtMouse - scrollY) * newPixelsPerKey;
            const maxScrollY = Math.max(0, MAX_PITCH - MIN_PITCH - visibleKeys);
            const newScrollY = Math.max(
              0,
              Math.min(
                maxScrollY,
                scrollY + (mouseY - newMouseY) / newPixelsPerKey,
              ),
            );
            setPixelsPerKey(newPixelsPerKey);
            setScrollY(newScrollY);
          }
        }
      }
      // No modifier = pan (both axes: deltaX→horizontal, deltaY→vertical)
      else {
        const maxScrollX = Math.max(0, totalBeats - visibleBeats);
        const maxScrollY = Math.max(0, MAX_PITCH - MIN_PITCH - visibleKeys);

        // deltaX = horizontal pan, deltaY = vertical pan (natural 2D trackpad behavior)
        const newScrollX = scrollX + e.deltaX / pixelsPerBeat;
        const newScrollY = scrollY + e.deltaY / pixelsPerKey;

        setScrollX(Math.max(0, Math.min(maxScrollX, newScrollX)));
        setScrollY(Math.max(0, Math.min(maxScrollY, newScrollY)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [
    pixelsPerBeat,
    pixelsPerKey,
    scrollX,
    scrollY,
    totalBeats,
    visibleBeats,
    visibleKeys,
  ]);

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
        // Check if clicking on edges for resize (in screen pixels)
        const noteScreenStart = gridToScreen(
          clickedNote.start,
          clickedNote.pitch,
        );
        const noteScreenEnd = gridToScreen(
          clickedNote.start + clickedNote.duration,
          clickedNote.pitch,
        );
        const rect = gridRef.current!.getBoundingClientRect();
        const clickScreenX = e.clientX - rect.left;
        const edgeThreshold = 8;

        if (clickScreenX - noteScreenStart.x < edgeThreshold) {
          // Resize from start
          setDragMode({
            type: "resizing-start",
            noteId: clickedNote.id,
            originalStart: clickedNote.start,
            originalDuration: clickedNote.duration,
          });
        } else if (noteScreenEnd.x - clickScreenX < edgeThreshold) {
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
      gridToScreen,
      selectNotes,
      deselectAll,
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
      // Find notes in the box (convert screen coords to content coords)
      const minScreenX = Math.min(dragMode.startX, dragMode.currentX);
      const maxScreenX = Math.max(dragMode.startX, dragMode.currentX);
      const minScreenY = Math.min(dragMode.startY, dragMode.currentY);
      const maxScreenY = Math.max(dragMode.startY, dragMode.currentY);

      // Convert to content coordinates
      const minBeat = minScreenX / pixelsPerBeat + scrollX;
      const maxBeat = maxScreenX / pixelsPerBeat + scrollX;
      const maxPitch =
        MAX_PITCH - scrollY - Math.floor(minScreenY / pixelsPerKey);
      const minPitch =
        MAX_PITCH - scrollY - Math.floor(maxScreenY / pixelsPerKey);

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
    pixelsPerBeat,
    pixelsPerKey,
    scrollX,
    scrollY,
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

  // Generate grid background with scroll offset
  const gridBackground = generateGridBackground(
    pixelsPerBeat,
    pixelsPerKey,
    gridSnap,
    scrollX,
    scrollY,
  );

  // Filter notes to visible range (with some margin)
  const visibleNotes = notes.filter((note) => {
    const noteEnd = note.start + note.duration;
    const inHorizontalRange =
      noteEnd > scrollX && note.start < scrollX + visibleBeats;
    const inVerticalRange =
      note.pitch < MAX_PITCH - scrollY + 1 &&
      note.pitch > MAX_PITCH - scrollY - visibleKeys - 1;
    return inHorizontalRange && inVerticalRange;
  });

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

        <span className="text-sm text-neutral-500 ml-4">
          Pan: trackpad/wheel | Zoom: Ctrl+wheel
        </span>

        <span className="text-sm text-neutral-500 ml-auto">
          {selectedNoteIds.size > 0 && `${selectedNoteIds.size} selected`}
        </span>
      </div>

      {/* Main content area - fixed layout, no native scroll */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left column: keyboard labels */}
        <div
          className="shrink-0 flex flex-col bg-neutral-900"
          style={{ width: KEYBOARD_WIDTH }}
        >
          {/* Timeline spacer */}
          <div className="shrink-0" style={{ height: TIMELINE_HEIGHT }} />
          {/* Waveform spacer */}
          <div
            className="shrink-0 border-b border-neutral-700 flex items-center justify-center text-xs text-neutral-500"
            style={{ height: WAVEFORM_HEIGHT }}
          >
            Audio
          </div>
          {/* Piano keyboard */}
          <div className="flex-1 overflow-hidden">
            <Keyboard
              pixelsPerKey={pixelsPerKey}
              scrollY={scrollY}
              viewportHeight={
                viewportSize.height - TIMELINE_HEIGHT - WAVEFORM_HEIGHT
              }
            />
          </div>
        </div>

        {/* Right column: timeline, waveform, grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Timeline */}
          <Timeline
            pixelsPerBeat={pixelsPerBeat}
            scrollX={scrollX}
            viewportWidth={viewportSize.width - KEYBOARD_WIDTH}
          />
          {/* Waveform placeholder */}
          <div
            className="shrink-0 bg-neutral-800 border-b border-neutral-700"
            style={{ height: WAVEFORM_HEIGHT }}
          />
          {/* Note grid with CSS background */}
          <svg
            ref={gridRef}
            data-testid="piano-roll-grid"
            width="100%"
            height="100%"
            className="flex-1 cursor-crosshair"
            onMouseDown={handleGridMouseDown}
            style={gridBackground}
          >
            {/* Notes */}
            {visibleNotes.map((note) => (
              <NoteRect
                key={note.id}
                note={note}
                selected={selectedNoteIds.has(note.id)}
                pixelsPerBeat={pixelsPerBeat}
                pixelsPerKey={pixelsPerKey}
                scrollX={scrollX}
                scrollY={scrollY}
              />
            ))}
            {/* Preview note while creating */}
            {dragMode.type === "creating" && (
              <rect
                x={(dragMode.startBeat - scrollX) * pixelsPerBeat}
                y={(MAX_PITCH - scrollY - dragMode.pitch) * pixelsPerKey}
                width={
                  (dragMode.currentBeat - dragMode.startBeat) * pixelsPerBeat
                }
                height={pixelsPerKey}
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
  );
}

function Keyboard({
  pixelsPerKey,
  scrollY,
  viewportHeight,
}: {
  pixelsPerKey: number;
  scrollY: number;
  viewportHeight: number;
}) {
  const rows = [];
  // Calculate which pitches are visible
  const startPitch = Math.min(MAX_PITCH, MAX_PITCH - Math.floor(scrollY));
  const endPitch = Math.max(
    MIN_PITCH,
    startPitch - Math.ceil(viewportHeight / pixelsPerKey) - 1,
  );

  // Offset for partial scroll
  const offsetY = -(scrollY % 1) * pixelsPerKey;

  for (let pitch = startPitch; pitch >= endPitch; pitch--) {
    const black = isBlackKey(pitch);
    const isC = pitch % 12 === 0; // C notes for octave label
    const isF = pitch % 12 === 5; // F notes
    // B/C and E/F are adjacent white keys - need clearer border
    const needsStrongBorder = isC || isF;
    rows.push(
      <div
        key={pitch}
        className={`flex items-center justify-end pr-2 text-xs border-b ${
          black
            ? "bg-neutral-800 border-neutral-700"
            : needsStrongBorder
              ? "bg-neutral-300 border-neutral-500 text-neutral-600"
              : "bg-neutral-300 border-neutral-400 text-neutral-600"
        }`}
        style={{ height: pixelsPerKey }}
      >
        {isC ? midiToNoteName(pitch) : ""}
      </div>,
    );
  }
  return <div style={{ marginTop: offsetY }}>{rows}</div>;
}

function Timeline({
  pixelsPerBeat,
  scrollX,
  viewportWidth,
}: {
  pixelsPerBeat: number;
  scrollX: number;
  viewportWidth: number;
}) {
  const markers = [];

  // Calculate visible beat range
  const startBeat = Math.floor(scrollX / BEATS_PER_BAR) * BEATS_PER_BAR;
  const endBeat =
    Math.ceil((scrollX + viewportWidth / pixelsPerBeat) / BEATS_PER_BAR) *
    BEATS_PER_BAR;

  for (let beat = startBeat; beat <= endBeat; beat += BEATS_PER_BAR) {
    const barNumber = beat / BEATS_PER_BAR + 1;
    const x = (beat - scrollX) * pixelsPerBeat;
    markers.push(
      <div
        key={beat}
        className="absolute text-xs text-neutral-400"
        style={{ left: x, top: 8 }}
      >
        {barNumber}
      </div>,
    );
  }

  return (
    <div
      className="relative shrink-0 bg-neutral-850 border-b border-neutral-700"
      style={{ height: TIMELINE_HEIGHT }}
    >
      {markers}
    </div>
  );
}

function NoteRect({
  note,
  selected,
  pixelsPerBeat,
  pixelsPerKey,
  scrollX,
  scrollY,
}: {
  note: Note;
  selected: boolean;
  pixelsPerBeat: number;
  pixelsPerKey: number;
  scrollX: number;
  scrollY: number;
}) {
  // Convert note position to screen coordinates
  const x = (note.start - scrollX) * pixelsPerBeat;
  const y = (MAX_PITCH - scrollY - note.pitch) * pixelsPerKey;
  const width = note.duration * pixelsPerBeat;

  return (
    <g data-testid={`note-${note.id}`} data-selected={selected}>
      <rect
        x={x}
        y={y + 1}
        width={width}
        height={pixelsPerKey - 2}
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
            height={pixelsPerKey}
            fill="transparent"
            style={{ cursor: "ew-resize" }}
          />
          <rect
            x={x + width - 6}
            y={y}
            width={6}
            height={pixelsPerKey}
            fill="transparent"
            style={{ cursor: "ew-resize" }}
          />
        </>
      )}
    </g>
  );
}
