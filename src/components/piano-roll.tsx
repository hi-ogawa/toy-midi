import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTransport } from "../hooks/use-transport";
import { useWindowEvent } from "../hooks/use-window-event";
import { audioManager } from "../lib/audio";
import {
  isBlackKey,
  MAX_PITCH,
  midiToNoteName,
  MIN_PITCH,
  snapToGrid,
  clampPitch,
} from "../lib/music";
import { historyStore } from "../stores/history-store";
import {
  beatsToSeconds,
  generateLocatorId,
  generateNoteId,
  secondsToBeats,
  useProjectStore,
} from "../stores/project-store";
import { GRID_SNAP_VALUES, GridSnap, Note } from "../types";

// Layout constants (exported for tests)
export const KEYBOARD_WIDTH = 60;
export const TIMELINE_HEIGHT = 32;
export const DEFAULT_WAVEFORM_HEIGHT = 60;
export const MIN_WAVEFORM_HEIGHT = 40;
export const MAX_WAVEFORM_HEIGHT = 200;
export const BEATS_PER_BAR = 4;

// Default zoom levels (pixels per beat/key)
const DEFAULT_PIXELS_PER_BEAT = 80;
const DEFAULT_PIXELS_PER_KEY = 20;
const MIN_PIXELS_PER_BEAT = 1; // Allow extreme zoom out for song overview
const MAX_PIXELS_PER_BEAT = 400;
const MIN_PIXELS_PER_KEY = 10;
const MAX_PIXELS_PER_KEY = 40;

// Minimum pixel spacing for grid line visibility (hide when lines are too dense)
const MIN_LINE_SPACING = 8;

// Generate vertical grid lines (bar, beat, sub-beat) for timelines
// Returns layers array for use with background CSS properties
function generateVerticalGridLayers(
  pixelsPerBeat: number,
  gridSnap: GridSnap,
  scrollX: number,
  beatsPerBar: number,
): Array<[string, string, string]> {
  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];
  const beatWidth = Math.round(pixelsPerBeat);
  const subBeatWidth = beatWidth * gridSnapValue;
  const barWidth = beatWidth * beatsPerBar;
  const offsetX = -(scrollX * beatWidth) % barWidth;

  const layers: Array<[string, string, string]> = [];

  // Vertical bar lines (every 4 beats, or coarser at extreme zoom)
  let coarseBarMultiplier = 1;
  while (barWidth * coarseBarMultiplier < MIN_LINE_SPACING) {
    coarseBarMultiplier *= 2;
  }
  const coarseBarWidth = barWidth * coarseBarMultiplier;
  const coarseBarOffsetX = -(scrollX * beatWidth) % coarseBarWidth;

  layers.push([
    `linear-gradient(90deg, #525252 0px, #525252 1px, transparent 1px, transparent 100%)`,
    `${coarseBarWidth}px 100%`,
    `${coarseBarOffsetX}px 0`,
  ]);

  // Vertical beat lines - hide when too dense
  if (beatWidth >= MIN_LINE_SPACING) {
    layers.push([
      `linear-gradient(90deg, #404040 0px, #404040 1px, transparent 1px, transparent 100%)`,
      `${beatWidth}px 100%`,
      `${offsetX}px 0`,
    ]);
  }

  // Vertical sub-beat lines (grid snap) - hide when too dense
  if (subBeatWidth >= MIN_LINE_SPACING) {
    layers.push([
      `linear-gradient(90deg, #333 0px, #333 1px, transparent 1px, transparent 100%)`,
      `${subBeatWidth}px 100%`,
      `${offsetX}px 0`,
    ]);
  }

  return layers;
}

// Deprecated: kept for E2E test compatibility
export const BASE_ROW_HEIGHT = DEFAULT_PIXELS_PER_KEY;
export const BASE_BEAT_WIDTH = DEFAULT_PIXELS_PER_BEAT;
export const ROW_HEIGHT = DEFAULT_PIXELS_PER_KEY;
export const BEAT_WIDTH = DEFAULT_PIXELS_PER_BEAT;

// Generate CSS background for grid (returns style object)
// Uses linear-gradient + background-size instead of repeating-linear-gradient
// to avoid subpixel rendering artifacts (see docs/2026-01-08-vertical-grid-alignment.md)
function generateGridBackground(
  pixelsPerBeat: number,
  pixelsPerKey: number,
  gridSnap: GridSnap,
  scrollX: number,
  scrollY: number,
  beatsPerBar: number,
): React.CSSProperties {
  // Round base sizes, derive others to avoid drift between grid layers
  const rowHeight = Math.round(pixelsPerKey);
  const octaveHeight = rowHeight * 12;

  // Calculate offsets for horizontal lines
  const rowOffsetY = -(scrollY % 1) * rowHeight;
  // Octave line at B/C boundary = bottom of C row
  const octaveOffsetY =
    ((((MAX_PITCH + 1 - scrollY) * rowHeight) % octaveHeight) + octaveHeight) %
    octaveHeight;

  // Build black key pattern gradient (one octave, 12 rows)
  // Black keys at positions 1, 3, 6, 8, 10 (C#, D#, F#, G#, A#)
  const blackKeyColor = "rgba(0,0,0,0.35)";
  const r = rowHeight;
  const blackKeyGradient = `linear-gradient(0deg,
    transparent 0, transparent ${r}px,
    ${blackKeyColor} ${r}px, ${blackKeyColor} ${2 * r}px,
    transparent ${2 * r}px, transparent ${3 * r}px,
    ${blackKeyColor} ${3 * r}px, ${blackKeyColor} ${4 * r}px,
    transparent ${4 * r}px, transparent ${6 * r}px,
    ${blackKeyColor} ${6 * r}px, ${blackKeyColor} ${7 * r}px,
    transparent ${7 * r}px, transparent ${8 * r}px,
    ${blackKeyColor} ${8 * r}px, ${blackKeyColor} ${9 * r}px,
    transparent ${9 * r}px, transparent ${10 * r}px,
    ${blackKeyColor} ${10 * r}px, ${blackKeyColor} ${11 * r}px,
    transparent ${11 * r}px, transparent ${12 * r}px
  )`;

  const layers: Array<[string, string, string]> = [];

  // Add vertical grid lines (bar, beat, sub-beat)
  layers.push(
    ...generateVerticalGridLayers(
      pixelsPerBeat,
      gridSnap,
      scrollX,
      beatsPerBar,
    ),
  );

  // Octave lines (B/C boundary) - always visible
  layers.push([
    `linear-gradient(180deg, #666666 0px, #666666 1px, transparent 1px, transparent 100%)`,
    `100% ${octaveHeight}px`,
    `0 ${octaveOffsetY}px`,
  ]);

  // Row lines (every pitch) - always visible for now
  layers.push([
    `linear-gradient(180deg, #333 0px, #333 1px, transparent 1px, transparent 100%)`,
    `100% ${rowHeight}px`,
    `0 ${rowOffsetY}px`,
  ]);

  // Black key row backgrounds (subtle darker shade)
  layers.push([
    blackKeyGradient,
    `100% ${octaveHeight}px`,
    `0 ${octaveOffsetY}px`,
  ]);

  return {
    backgroundColor: "#1a1a1a",
    backgroundImage: layers.map(([gradient]) => gradient).join(", "),
    backgroundSize: layers.map(([, size]) => size).join(", "),
    backgroundPosition: layers.map(([, , position]) => position).join(", "),
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
      cellOffset: number; // which grid cell within the note was grabbed
      offsetPitch: number;
      // Original states of all notes being moved (for undo)
      originalStates: Array<{ id: string; start: number; pitch: number }>;
    }
  | {
      type: "duplicating";
      noteId: string; // The primary duplicate note being tracked
      startBeat: number;
      startPitch: number;
      cellOffset: number; // which grid cell within the note was grabbed
      offsetPitch: number;
      // Original notes that were duplicated (for reference, not modified)
      originalNotes: Array<{
        id: string;
        start: number;
        pitch: number;
        duration: number;
        velocity: number;
      }>;
      // IDs of the newly created duplicate notes
      duplicateNoteIds: string[];
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
    tempo,
    timeSignature,
    audioDuration,
    audioOffset,
    audioFileName,
    showDebug,
    autoScrollEnabled,
    addNote,
    updateNote,
    deleteNotes,
    selectNotes,
    deselectAll,
    setAudioOffset,
    audioPeaks,
    undo,
    redo,
    canUndo,
    canRedo,
    // Locator state and actions
    locators,
    selectedLocatorId,
    addLocator,
    updateLocator,
    deleteLocator,
    selectLocator,
    copyNotes,
    pasteNotes,
    // Viewport state from store
    scrollX,
    scrollY,
    pixelsPerBeat,
    pixelsPerKey,
    waveformHeight,
    setScrollX,
    setScrollY,
    setPixelsPerBeat,
    setPixelsPerKey,
    setWaveformHeight,
  } = useProjectStore();

  // Transport state from hook (source of truth: Tone.js Transport)
  const { isPlaying, position } = useTransport();

  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });

  // Track viewport size
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 400 });

  const gridSnapValue = GRID_SNAP_VALUES[gridSnap];
  const beatsPerBar = timeSignature.numerator; // Get beats per bar from time signature

  // Round pixel sizes to avoid subpixel rendering artifacts
  // Keep fractional values in state for smooth zoom, but render with whole pixels
  const roundedPixelsPerKey = Math.round(pixelsPerKey);
  const roundedPixelsPerBeat = Math.round(pixelsPerBeat);

  // Edge threshold for resize handles: 20% of grid cell, clamped to 6-20px
  const gridCellWidth = gridSnapValue * roundedPixelsPerBeat;
  const edgeThreshold = Math.max(6, Math.min(50, gridCellWidth * 0.2));

  // Update viewport size on resize (useLayoutEffect to measure before paint)
  useLayoutEffect(() => {
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

  // Auto-scroll during playback to keep playhead visible
  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled) return;
    const playheadBeat = secondsToBeats(position, tempo);
    const visibleBeatsNow = viewportSize.width / pixelsPerBeat;
    // If playhead is past 80% of visible area, scroll to put it at 20%
    if (playheadBeat > scrollX + visibleBeatsNow * 0.8) {
      setScrollX(Math.max(0, playheadBeat - visibleBeatsNow * 0.2));
    }
    // If playhead is before visible area, scroll to show it
    if (playheadBeat < scrollX) {
      setScrollX(Math.max(0, playheadBeat - visibleBeatsNow * 0.2));
    }
  }, [
    isPlaying,
    autoScrollEnabled,
    position,
    tempo,
    scrollX,
    pixelsPerBeat,
    viewportSize.width,
  ]);

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
      // Pitch must be integer - combine scroll offset and y position before flooring
      const pitch = clampPitch(
        MAX_PITCH - Math.floor(scrollY + y / pixelsPerKey),
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
  useWindowEvent("keydown", (e) => {
    // Don't trigger shortcuts if typing in an input
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedNoteIds.size > 0) {
        deleteNotes(Array.from(selectedNoteIds));
      } else if (selectedLocatorId) {
        deleteLocator(selectedLocatorId);
      }
    } else if (e.key === "Escape") {
      deselectAll();
      selectLocator(null);
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      // Ctrl+C or Cmd+C: Copy
      e.preventDefault();
      copyNotes();
    } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      // Ctrl+V or Cmd+V: Paste at snapped playhead position
      e.preventDefault();
      const playheadBeat = secondsToBeats(position, tempo);
      const snappedBeat = snapToGrid(playheadBeat, gridSnapValue);
      pasteNotes(snappedBeat);
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      // Ctrl+Shift+Z or Cmd+Shift+Z: Redo
      e.preventDefault();
      if (canRedo()) {
        redo();
      }
    } else if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Y or Cmd+Y: Redo (alternative)
      e.preventDefault();
      if (canRedo()) {
        redo();
      }
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      // Ctrl+Z or Cmd+Z: Undo
      e.preventDefault();
      if (canUndo()) {
        undo();
      }
    } else if (e.key === "l" || e.key === "L") {
      // L: Add locator at current playhead position
      const playheadBeat = secondsToBeats(position, tempo);
      const snappedBeat = snapToGrid(playheadBeat, gridSnapValue);
      handleAddLocator(snappedBeat);
    }
  });

  // Handle wheel for pan/zoom (2D: both deltaX and deltaY)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - KEYBOARD_WIDTH;
      const mouseY = e.clientY - rect.top - TIMELINE_HEIGHT - waveformHeight;

      // Ctrl + wheel = horizontal zoom, Shift + wheel = vertical zoom
      if (e.ctrlKey || e.shiftKey) {
        if (e.deltaY !== 0) {
          // Ctrl + deltaY = horizontal zoom
          if (e.ctrlKey && !e.shiftKey) {
            const hZoomFactor = e.deltaY > 0 ? 0.9 : e.deltaY < 0 ? 1.1 : 1;
            const newPixelsPerBeat = Math.max(
              MIN_PIXELS_PER_BEAT,
              Math.min(MAX_PIXELS_PER_BEAT, pixelsPerBeat * hZoomFactor),
            );
            // Zoom around mouse position horizontally
            const beatAtMouse = mouseX / pixelsPerBeat + scrollX;
            const newScrollX = Math.max(
              0,
              beatAtMouse - mouseX / newPixelsPerBeat,
            );
            setPixelsPerBeat(newPixelsPerBeat);
            setScrollX(newScrollX);
          }
          // Shift + deltaY = vertical zoom (only if mouse is over keyboard/grid area)
          else if (e.shiftKey && !e.ctrlKey && mouseY >= 0) {
            const vZoomFactor = e.deltaY > 0 ? 0.9 : e.deltaY < 0 ? 1.1 : 1;
            const newPixelsPerKey = Math.max(
              MIN_PIXELS_PER_KEY,
              Math.min(MAX_PIXELS_PER_KEY, pixelsPerKey * vZoomFactor),
            );
            // Zoom around mouse position vertically
            const keyAtMouse = mouseY / pixelsPerKey + scrollY;
            const newVisibleKeys = viewportSize.height / newPixelsPerKey;
            const maxScrollY = Math.max(
              0,
              MAX_PITCH - MIN_PITCH - newVisibleKeys,
            );
            const newScrollY = Math.max(
              0,
              Math.min(maxScrollY, keyAtMouse - mouseY / newPixelsPerKey),
            );
            setPixelsPerKey(newPixelsPerKey);
            setScrollY(newScrollY);
          }
        }
      }
      // No modifier = pan (both axes: deltaX→horizontal, deltaY→vertical)
      else {
        const maxScrollY = Math.max(0, MAX_PITCH - MIN_PITCH - visibleKeys);

        // deltaX = horizontal pan, deltaY = vertical pan (natural 2D trackpad behavior)
        // No horizontal limit - allow infinite scroll for arbitrary song length
        const newScrollX = scrollX + e.deltaX / pixelsPerBeat;
        const newScrollY = scrollY + e.deltaY / pixelsPerKey;

        setScrollX(Math.max(0, newScrollX));
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
    visibleKeys,
    viewportSize.height,
    waveformHeight,
  ]);

  // Handle mouse events on the grid
  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const { beat, pitch } = screenToGrid(e.clientX, e.clientY);
      const snappedBeat = snapToGrid(beat, gridSnapValue);
      const rect = gridRef.current!.getBoundingClientRect();
      const clickScreenX = e.clientX - rect.left;

      // First, check if clicking near any note's edge (works outside note bounds too)
      // This enables resize without selecting first
      const notesAtPitch = notes.filter((n) => n.pitch === pitch);
      for (const note of notesAtPitch) {
        const noteScreenStart = gridToScreen(note.start, note.pitch);
        const noteScreenEnd = gridToScreen(
          note.start + note.duration,
          note.pitch,
        );

        // Check right edge first (more common: extending notes)
        const distToEnd = Math.abs(clickScreenX - noteScreenEnd.x);
        if (distToEnd < edgeThreshold) {
          historyStore.startDrag();
          setDragMode({
            type: "resizing-end",
            noteId: note.id,
            originalStart: note.start,
            originalDuration: note.duration,
          });
          return;
        }

        // Check left edge
        const distToStart = Math.abs(clickScreenX - noteScreenStart.x);
        if (distToStart < edgeThreshold) {
          historyStore.startDrag();
          setDragMode({
            type: "resizing-start",
            noteId: note.id,
            originalStart: note.start,
            originalDuration: note.duration,
          });
          return;
        }
      }

      // Check if clicking on a note (not on edge)
      const clickedNote = notes.find(
        (n) =>
          beat >= n.start && beat < n.start + n.duration && pitch === n.pitch,
      );

      if (clickedNote) {
        // Check if Ctrl+clicking on already selected note -> duplicate mode
        const isAlreadySelected = selectedNoteIds.has(clickedNote.id);
        const shouldDuplicate = (e.ctrlKey || e.metaKey) && isAlreadySelected;

        if (shouldDuplicate) {
          // Duplicate all selected notes
          const notesToDuplicate = notes.filter((n) =>
            selectedNoteIds.has(n.id),
          );
          const duplicateNoteIds: string[] = [];
          const originalNotes = notesToDuplicate.map((n) => ({
            id: n.id,
            start: n.start,
            pitch: n.pitch,
            duration: n.duration,
            velocity: n.velocity,
          }));

          // Create duplicates at the same position as originals
          notesToDuplicate.forEach((originalNote) => {
            const duplicateNote: Note = {
              id: generateNoteId(),
              pitch: originalNote.pitch,
              start: originalNote.start,
              duration: originalNote.duration,
              velocity: originalNote.velocity,
            };
            addNote(duplicateNote);
            duplicateNoteIds.push(duplicateNote.id);
          });

          // Select the duplicates instead of the originals
          selectNotes(duplicateNoteIds, true);

          // Preview note sound on drag start
          audioManager.playNote(clickedNote.pitch);

          // Find the duplicate that corresponds to the clicked note
          const clickedIndex = notesToDuplicate.findIndex(
            (n) => n.id === clickedNote.id,
          );
          const duplicateClickedNoteId = duplicateNoteIds[clickedIndex];

          historyStore.startDrag();
          setDragMode({
            type: "duplicating",
            noteId: duplicateClickedNoteId,
            startBeat: clickedNote.start,
            startPitch: clickedNote.pitch,
            cellOffset: Math.floor((beat - clickedNote.start) / gridSnapValue),
            offsetPitch: 0,
            originalNotes,
            duplicateNoteIds,
          });
        } else {
          // Normal selection and move behavior
          if (e.shiftKey) {
            selectNotes([clickedNote.id], false);
          } else if (!isAlreadySelected) {
            selectNotes([clickedNote.id], true);
          }
          // Preview note sound on drag start
          audioManager.playNote(clickedNote.pitch);

          // Capture original states of all selected notes for undo
          // Note: if clicked note wasn't selected, it's now the only selected one
          const notesToMove = selectedNoteIds.has(clickedNote.id)
            ? notes.filter((n) => selectedNoteIds.has(n.id))
            : [clickedNote];
          const originalStates = notesToMove.map((n) => ({
            id: n.id,
            start: n.start,
            pitch: n.pitch,
          }));

          historyStore.startDrag();
          setDragMode({
            type: "moving",
            noteId: clickedNote.id,
            startBeat: clickedNote.start,
            startPitch: clickedNote.pitch,
            // Cell offset: which grid cell within the note was grabbed
            cellOffset: Math.floor((beat - clickedNote.start) / gridSnapValue),
            offsetPitch: 0,
            originalStates,
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
          // Preview note sound on creation start
          audioManager.playNote(pitch);
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
      edgeThreshold,
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
        // Cell-based snapping: note moves when cursor crosses grid lines
        const cursorCell = Math.floor(beat / gridSnapValue);
        const newStart = Math.max(
          0,
          (cursorCell - dragMode.cellOffset) * gridSnapValue,
        );
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
      } else if (dragMode.type === "duplicating") {
        // Cell-based snapping: duplicate notes move when cursor crosses grid lines
        const cursorCell = Math.floor(beat / gridSnapValue);
        const newStart = Math.max(
          0,
          (cursorCell - dragMode.cellOffset) * gridSnapValue,
        );
        const newPitch = clampPitch(pitch);
        updateNote(dragMode.noteId, { start: newStart, pitch: newPitch });
        // Update other duplicate notes too
        if (dragMode.duplicateNoteIds.length > 1) {
          const deltaStart = newStart - dragMode.startBeat;
          const deltaPitch = newPitch - dragMode.startPitch;
          dragMode.duplicateNoteIds.forEach((id) => {
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
        // Cell-based snap: cursor's cell determines the new start position
        const cursorCell = Math.floor(beat / gridSnapValue);
        const newStart = cursorCell * gridSnapValue;
        const originalEnd = dragMode.originalStart + dragMode.originalDuration;
        const newDuration = originalEnd - newStart;
        if (newStart >= 0 && newDuration >= gridSnapValue) {
          updateNote(dragMode.noteId, {
            start: newStart,
            duration: newDuration,
          });
        }
      } else if (dragMode.type === "resizing-end") {
        // Cell-based snap: cursor's cell determines the new end position
        const cursorCell = Math.floor(beat / gridSnapValue);
        const newEnd = (cursorCell + 1) * gridSnapValue;
        const newDuration = Math.max(
          gridSnapValue,
          newEnd - dragMode.originalStart,
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
    } else if (dragMode.type === "moving") {
      // End drag and push history for all moved notes
      historyStore.endDrag();

      // Build history entry comparing original states to current states
      const updates = dragMode.originalStates
        .map(({ id, start, pitch }) => {
          const currentNote = notes.find((n) => n.id === id);
          if (!currentNote) return null;
          // Only record if actually changed
          if (currentNote.start === start && currentNote.pitch === pitch) {
            return null;
          }
          return {
            id,
            before: { start, pitch },
            after: { start: currentNote.start, pitch: currentNote.pitch },
          };
        })
        .filter((u) => u !== null);

      if (updates.length > 0) {
        historyStore.pushOperation({
          type: "update-notes",
          updates,
        });
      }
    } else if (dragMode.type === "duplicating") {
      // End drag - record the duplication as an add-notes operation
      historyStore.endDrag();

      // Get the current state of all duplicate notes
      const currentDuplicates = notes.filter((n) =>
        dragMode.duplicateNoteIds.includes(n.id),
      );

      if (currentDuplicates.length > 0) {
        historyStore.pushOperation({
          type: "add-notes",
          notes: currentDuplicates,
        });
      }

      // The duplicates are already selected, so nothing more to do
    } else if (dragMode.type === "resizing-start") {
      // End drag and push history for resize
      historyStore.endDrag();

      const currentNote = notes.find((n) => n.id === dragMode.noteId);
      if (
        currentNote &&
        (currentNote.start !== dragMode.originalStart ||
          currentNote.duration !== dragMode.originalDuration)
      ) {
        historyStore.pushOperation({
          type: "update-notes",
          updates: [
            {
              id: dragMode.noteId,
              before: {
                start: dragMode.originalStart,
                duration: dragMode.originalDuration,
              },
              after: {
                start: currentNote.start,
                duration: currentNote.duration,
              },
            },
          ],
        });
      }
    } else if (dragMode.type === "resizing-end") {
      // End drag and push history for resize
      historyStore.endDrag();

      const currentNote = notes.find((n) => n.id === dragMode.noteId);
      if (currentNote && currentNote.duration !== dragMode.originalDuration) {
        historyStore.pushOperation({
          type: "update-notes",
          updates: [
            {
              id: dragMode.noteId,
              before: { duration: dragMode.originalDuration },
              after: { duration: currentNote.duration },
            },
          ],
        });
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

  useWindowEvent("mousemove", (e) => {
    if (dragMode.type !== "none") {
      handleMouseMove(e);
    }
  });

  useWindowEvent("mouseup", () => {
    if (dragMode.type !== "none") {
      handleMouseUp();
    }
  });

  // Generate grid background with scroll offset (use rounded values)
  const gridBackground = generateGridBackground(
    roundedPixelsPerBeat,
    roundedPixelsPerKey,
    gridSnap,
    scrollX,
    scrollY,
    beatsPerBar,
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

  // Locator handlers
  const handleAddLocator = (position: number) => {
    const locatorNumber = locators.length + 1;
    const newLocator = {
      id: generateLocatorId(),
      position,
      label: `Section ${locatorNumber}`,
    };
    addLocator(newLocator);
    selectLocator(newLocator.id);
  };

  const handleSelectLocator = (id: string) => {
    selectLocator(id);
    deselectAll(); // Deselect notes when selecting a locator
  };

  const handleUpdateLocator = (id: string, position: number) => {
    updateLocator(id, { position });
  };

  const handleRenameLocator = (id: string, currentLabel: string) => {
    const newLabel = window.prompt("Rename locator:", currentLabel);
    if (newLabel !== null && newLabel.trim() !== "") {
      updateLocator(id, { label: newLabel.trim() });
    }
  };

  const handleDeleteLocator = (id: string) => {
    deleteLocator(id);
  };

  return (
    <div className="flex flex-col flex-1 bg-neutral-900 text-neutral-100 select-none overflow-hidden">
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
            style={{ height: waveformHeight }}
          >
            Audio
          </div>
          {/* Piano keyboard */}
          <div className="flex-1 overflow-hidden">
            <Keyboard
              pixelsPerKey={roundedPixelsPerKey}
              scrollY={scrollY}
              viewportHeight={
                viewportSize.height - TIMELINE_HEIGHT - waveformHeight
              }
            />
          </div>
        </div>

        {/* Right column: timeline, waveform, grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Timeline */}
          <Timeline
            pixelsPerBeat={roundedPixelsPerBeat}
            scrollX={scrollX}
            viewportWidth={viewportSize.width - KEYBOARD_WIDTH}
            playheadBeat={secondsToBeats(position, tempo)}
            beatsPerBar={beatsPerBar}
            gridSnapValue={gridSnapValue}
            onSeek={(beat) => {
              const seconds = beatsToSeconds(beat, tempo);
              audioManager.seek(seconds);
            }}
            locators={locators}
            selectedLocatorId={selectedLocatorId}
            onSelectLocator={handleSelectLocator}
            onRenameLocator={handleRenameLocator}
            onUpdateLocator={handleUpdateLocator}
            onDeleteLocator={handleDeleteLocator}
          />
          {/* Waveform / Audio region */}
          <WaveformArea
            pixelsPerBeat={roundedPixelsPerBeat}
            gridSnap={gridSnap}
            scrollX={scrollX}
            viewportWidth={viewportSize.width - KEYBOARD_WIDTH}
            audioDuration={audioDuration}
            audioOffset={audioOffset}
            audioFileName={audioFileName}
            tempo={tempo}
            playheadBeat={secondsToBeats(position, tempo)}
            audioPeaks={audioPeaks}
            height={waveformHeight}
            beatsPerBar={beatsPerBar}
            onOffsetChange={setAudioOffset}
            onHeightChange={setWaveformHeight}
          />
          {/* Note grid with CSS background */}
          <div
            ref={gridRef}
            data-testid="piano-roll-grid"
            className="flex-1 cursor-crosshair relative overflow-hidden"
            onMouseDown={handleGridMouseDown}
            style={gridBackground}
          >
            {/* Debug: reference lines at y=0, pixelsPerKey, 2*pixelsPerKey (red) */}
            {showDebug && (
              <>
                <div
                  className="absolute left-0 right-0 h-[2px] bg-red-500"
                  style={{ top: 0 }}
                />
                <div
                  className="absolute left-0 right-0 h-px bg-red-500"
                  style={{ top: roundedPixelsPerKey }}
                />
                <div
                  className="absolute left-0 right-0 h-px bg-red-500"
                  style={{ top: 2 * roundedPixelsPerKey }}
                />
                <div
                  className="absolute text-red-500 text-[10px]"
                  style={{ left: 5, top: 2 }}
                >
                  y=0
                </div>
                <div
                  className="absolute text-red-500 text-[10px]"
                  style={{ left: 5, top: roundedPixelsPerKey + 2 }}
                >
                  y={roundedPixelsPerKey}
                </div>
              </>
            )}
            {/* Notes */}
            {visibleNotes.map((note) => (
              <NoteDiv
                key={note.id}
                note={note}
                selected={selectedNoteIds.has(note.id)}
                pixelsPerBeat={roundedPixelsPerBeat}
                pixelsPerKey={roundedPixelsPerKey}
                scrollX={scrollX}
                scrollY={scrollY}
                edgeThreshold={edgeThreshold}
              />
            ))}
            {/* Preview note while creating */}
            {dragMode.type === "creating" && (
              <div
                className="absolute rounded-sm opacity-50"
                style={{
                  left: (dragMode.startBeat - scrollX) * roundedPixelsPerBeat,
                  top:
                    (MAX_PITCH - scrollY - dragMode.pitch) *
                    roundedPixelsPerKey,
                  width:
                    (dragMode.currentBeat - dragMode.startBeat) *
                    roundedPixelsPerBeat,
                  height: roundedPixelsPerKey,
                  backgroundColor: "#3b82f6",
                }}
              />
            )}
            {/* Box select rectangle */}
            {dragMode.type === "box-select" && (
              <div
                className="absolute border border-blue-500 bg-blue-500/20"
                style={{
                  left: Math.min(dragMode.startX, dragMode.currentX),
                  top: Math.min(dragMode.startY, dragMode.currentY),
                  width: Math.abs(dragMode.currentX - dragMode.startX),
                  height: Math.abs(dragMode.currentY - dragMode.startY),
                }}
              />
            )}
            {/* Playhead line */}
            {(() => {
              const playheadBeat = secondsToBeats(position, tempo);
              const playheadX = (playheadBeat - scrollX) * roundedPixelsPerBeat;
              // Only render if visible
              if (playheadX < 0 || playheadX > viewportSize.width) return null;
              return (
                <div
                  className="absolute top-0 bottom-0 w-px bg-sky-400 pointer-events-none z-10"
                  style={{ left: playheadX }}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="fixed bottom-4 right-4 bg-neutral-800 border border-neutral-600 rounded-lg p-4 text-xs font-mono max-w-md max-h-96 overflow-auto shadow-lg z-50 select-text">
          <div className="font-bold text-yellow-400 mb-2">Debug Info</div>

          <div className="mb-3">
            <div className="text-neutral-400 mb-1">Scroll State:</div>
            <div className="text-cyan-400">scrollY: {scrollY.toFixed(6)}</div>
            <div className="text-cyan-400">
              Math.floor(scrollY): {Math.floor(scrollY)}
            </div>
            <div className="text-cyan-400">
              scrollY % 1: {(scrollY % 1).toFixed(6)}
            </div>
            <div>
              pixelsPerKey: {pixelsPerKey.toFixed(4)} →{" "}
              <span className="text-green-400">{roundedPixelsPerKey}</span>
            </div>
            <div>
              pixelsPerBeat: {pixelsPerBeat.toFixed(4)} →{" "}
              <span className="text-green-400">{roundedPixelsPerBeat}</span>
            </div>
            <div>
              topPitch: {MAX_PITCH - Math.floor(scrollY)} (
              {midiToNoteName(MAX_PITCH - Math.floor(scrollY))})
            </div>
          </div>

          <div className="mb-3">
            <div className="text-neutral-400 mb-1">Row Lines Offset:</div>
            <div className="text-cyan-400">
              rowOffsetY = -(scrollY % 1) * pixelsPerKey
            </div>
            <div className="text-cyan-400">
              {" "}
              = -{(scrollY % 1).toFixed(6)} * {pixelsPerKey.toFixed(2)}
            </div>
            <div className="text-cyan-400">
              {" "}
              = {(-(scrollY % 1) * pixelsPerKey).toFixed(4)}px
            </div>
            <div>
              Grid lines at: {(-(scrollY % 1) * pixelsPerKey).toFixed(2)},{" "}
              {(-(scrollY % 1) * pixelsPerKey + pixelsPerKey).toFixed(2)},{" "}
              {(-(scrollY % 1) * pixelsPerKey + 2 * pixelsPerKey).toFixed(2)}...
            </div>
            <div className="text-neutral-500 mt-1">
              Row tops (from topPitch):
            </div>
            {Array.from(
              { length: 5 },
              (_, i) => MAX_PITCH - Math.floor(scrollY) - i,
            ).map((p) => {
              const y = (MAX_PITCH - scrollY - p) * pixelsPerKey;
              return (
                <div key={p} className="text-neutral-500">
                  {midiToNoteName(p)} (pitch {p}): y={y.toFixed(4)}px
                </div>
              );
            })}
            <div className="text-yellow-400 mt-1">
              Diff (row[0] - gridLine[0]):{" "}
              {(
                (MAX_PITCH - scrollY - (MAX_PITCH - Math.floor(scrollY))) *
                  pixelsPerKey -
                -(scrollY % 1) * pixelsPerKey
              ).toFixed(6)}
              px
            </div>
          </div>

          <div className="mb-3">
            <div className="text-neutral-400 mb-1">
              B/C Boundary (octave line):
            </div>
            {(() => {
              const topPitchVal = MAX_PITCH - scrollY;
              const topPitchInOctave =
                ((Math.floor(topPitchVal) % 12) + 12) % 12;
              const octaveHeight = pixelsPerKey * 12;
              const octaveOffsetYVal =
                ((((MAX_PITCH - scrollY) * pixelsPerKey) % octaveHeight) +
                  octaveHeight) %
                octaveHeight;
              // Find first C at or below topPitch
              const firstCPitch = Math.floor(topPitchVal) - topPitchInOctave;
              const firstCRowTop =
                (MAX_PITCH - scrollY - firstCPitch) * pixelsPerKey;
              // Expected: firstCRowTop mod octaveHeight should equal octaveOffsetY
              const expectedOffset =
                ((firstCRowTop % octaveHeight) + octaveHeight) % octaveHeight;
              return (
                <>
                  <div>topPitch: {topPitchVal.toFixed(4)}</div>
                  <div>octaveHeight: {octaveHeight.toFixed(2)}px</div>
                  <div>octaveOffsetY: {octaveOffsetYVal.toFixed(4)}px</div>
                  <div className="text-green-400">
                    First C: {midiToNoteName(firstCPitch)} (pitch {firstCPitch})
                  </div>
                  <div className="text-green-400">
                    C row top: {firstCRowTop.toFixed(4)}px
                  </div>
                  <div className="text-green-400">
                    C row top mod octaveHeight: {expectedOffset.toFixed(4)}px
                  </div>
                  <div
                    className={
                      Math.abs(expectedOffset - octaveOffsetYVal) < 0.001
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    Diff: {(expectedOffset - octaveOffsetYVal).toFixed(6)}px
                  </div>
                </>
              );
            })()}
          </div>

          <div className="mb-3">
            <div className="text-neutral-400 mb-1">Grid settings:</div>
            <div>gridSnap: {gridSnap}</div>
            <div>totalBeats: {totalBeats}</div>
          </div>

          <div>
            <div className="text-neutral-400 mb-1">
              Notes ({notes.length} total, {visibleNotes.length} visible):
            </div>
            {notes.length === 0 ? (
              <div className="text-neutral-500">No notes</div>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className={`${selectedNoteIds.has(note.id) ? "text-blue-400" : ""}`}
                  >
                    {note.id}: pitch={note.pitch} ({midiToNoteName(note.pitch)}
                    ), start={note.start.toFixed(2)}, dur=
                    {note.duration.toFixed(2)}
                    <span className="text-neutral-500 ml-1">
                      → y={(MAX_PITCH - scrollY - note.pitch) * pixelsPerKey}px
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
  const [isDragging, setIsDragging] = useState(false);
  const lastPlayedPitch = useRef<number | null>(null);

  useWindowEvent("mouseup", () => {
    setIsDragging(false);
    lastPlayedPitch.current = null;
  });

  const playPitch = useCallback((pitch: number) => {
    if (lastPlayedPitch.current !== pitch) {
      lastPlayedPitch.current = pitch;
      audioManager.playNote(pitch);
    }
  }, []);

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
        className={`flex items-center justify-end pr-2 text-xs border-b cursor-pointer hover:brightness-110 ${
          black
            ? "bg-neutral-800 border-neutral-700"
            : needsStrongBorder
              ? "bg-neutral-300 border-neutral-500 text-neutral-600"
              : "bg-neutral-300 border-neutral-400 text-neutral-600"
        }`}
        style={{ height: pixelsPerKey }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          playPitch(pitch);
        }}
        onMouseEnter={() => {
          if (isDragging) {
            playPitch(pitch);
          }
        }}
      >
        {isC ? midiToNoteName(pitch) : ""}
      </div>,
    );
  }
  return <div style={{ marginTop: offsetY }}>{rows}</div>;
}

// Minimum pixel spacing for timeline labels to avoid overlap
const MIN_LABEL_SPACING = 30;

function Timeline({
  pixelsPerBeat,
  scrollX,
  viewportWidth,
  playheadBeat,
  beatsPerBar,
  gridSnapValue,
  onSeek,
  locators,
  selectedLocatorId,
  onSelectLocator,
  onRenameLocator,
  onUpdateLocator: _onUpdateLocator,
  onDeleteLocator: _onDeleteLocator,
}: {
  pixelsPerBeat: number;
  scrollX: number;
  viewportWidth: number;
  playheadBeat: number;
  beatsPerBar: number;
  gridSnapValue: number;
  onSeek: (beat: number) => void;
  locators: Array<{ id: string; position: number; label: string }>;
  selectedLocatorId: string | null;
  onSelectLocator: (id: string) => void;
  onRenameLocator: (id: string, currentLabel: string) => void;
  onUpdateLocator: (id: string, position: number) => void;
  onDeleteLocator: (id: string) => void;
}) {
  const markers = [];

  // Use rounded beatWidth to match grid alignment (grid uses Math.round for clean patterns)
  const beatWidth = Math.round(pixelsPerBeat);

  // Find label step: smallest power of 2 bars where spacing >= MIN_LABEL_SPACING
  const barWidth = beatsPerBar * beatWidth;
  let labelBarStep = 1;
  while (barWidth * labelBarStep < MIN_LABEL_SPACING) {
    labelBarStep *= 2;
  }
  const labelBeatStep = labelBarStep * beatsPerBar;

  // Calculate visible beat range, aligned to label step
  const startBeat = Math.floor(scrollX / labelBeatStep) * labelBeatStep;
  const endBeat =
    Math.ceil((scrollX + viewportWidth / beatWidth) / labelBeatStep) *
    labelBeatStep;

  for (let beat = startBeat; beat <= endBeat; beat += labelBeatStep) {
    const barNumber = beat / beatsPerBar + 1;
    const x = (beat - scrollX) * beatWidth;
    markers.push(
      <Fragment key={beat}>
        {/* Bar line tick mark */}
        <div
          className="absolute w-px bg-neutral-600"
          style={{ left: x, top: 0, height: TIMELINE_HEIGHT }}
        />
        {/* Bar number label */}
        <div
          className="absolute text-xs text-neutral-400"
          style={{ left: x + 6, top: 8 }}
        >
          {barNumber}
        </div>
      </Fragment>,
    );
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const beat = x / pixelsPerBeat + scrollX;
    const snappedBeat = snapToGrid(beat, gridSnapValue);
    onSeek(Math.max(0, snappedBeat));
  };

  // Playhead position on timeline
  const playheadX = (playheadBeat - scrollX) * pixelsPerBeat;
  const showPlayhead = playheadX >= 0 && playheadX <= viewportWidth;

  // Filter visible locators
  const visibleLocators = locators.filter((locator) => {
    const x = (locator.position - scrollX) * beatWidth;
    return x >= -50 && x <= viewportWidth + 50; // Add margin for labels
  });

  return (
    <div
      data-testid="timeline"
      className="relative shrink-0 bg-neutral-850 border-b border-neutral-700 cursor-pointer"
      style={{ height: TIMELINE_HEIGHT }}
      onClick={handleClick}
    >
      {markers}
      {/* Locators */}
      {visibleLocators.map((locator) => {
        const x = (locator.position - scrollX) * beatWidth;
        const isSelected = locator.id === selectedLocatorId;
        return (
          <div
            key={locator.id}
            data-testid={`locator-${locator.id}`}
            className="absolute group"
            style={{ left: x - 5, top: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectLocator(locator.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRenameLocator(locator.id, locator.label);
            }}
          >
            {/* Triangle marker */}
            <div
              className={`w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent cursor-pointer ${
                isSelected ? "border-t-amber-400" : "border-t-sky-400"
              } group-hover:border-t-amber-300`}
            />
            {/* Label */}
            <div
              className={`absolute top-1 left-[12px] text-[10px] whitespace-nowrap px-1 rounded ${
                isSelected
                  ? "bg-amber-400 text-neutral-900"
                  : "bg-neutral-700 text-neutral-300"
              } group-hover:bg-amber-300 group-hover:text-neutral-900 pointer-events-none`}
            >
              {locator.label}
            </div>
          </div>
        );
      })}
      {/* Playhead indicator */}
      {showPlayhead && (
        <div
          data-testid="timeline-playhead"
          className="absolute top-0 bottom-0 w-px bg-sky-400 pointer-events-none"
          style={{ left: playheadX }}
        />
      )}
    </div>
  );
}

function NoteDiv({
  note,
  selected,
  pixelsPerBeat,
  pixelsPerKey,
  scrollX,
  scrollY,
  edgeThreshold,
}: {
  note: Note;
  selected: boolean;
  pixelsPerBeat: number;
  pixelsPerKey: number;
  scrollX: number;
  scrollY: number;
  edgeThreshold: number;
}) {
  // Convert note position to screen coordinates
  const x = (note.start - scrollX) * pixelsPerBeat;
  const y = (MAX_PITCH - scrollY - note.pitch) * pixelsPerKey;
  const width = note.duration * pixelsPerBeat;

  // Handle extends edgeThreshold on each side of edge (matching detection zone)
  const handleWidth = Math.round(edgeThreshold * 2);

  return (
    <div
      data-testid={`note-${note.id}`}
      data-selected={selected}
      className="absolute rounded-sm cursor-move"
      style={{
        left: x,
        top: y + 1,
        width,
        height: pixelsPerKey - 2,
        backgroundColor: selected ? "#60a5fa" : "#3b82f6",
        border: `${selected ? 2 : 1}px solid ${selected ? "#93c5fd" : "#2563eb"}`,
        boxSizing: "border-box",
      }}
    >
      {/* Resize handles - always visible for edge grabbing */}
      <div
        className="absolute top-0 h-full cursor-ew-resize"
        style={{ left: -edgeThreshold, width: handleWidth }}
      />
      <div
        className="absolute top-0 h-full cursor-ew-resize"
        style={{ right: -edgeThreshold, width: handleWidth }}
      />
    </div>
  );
}

function WaveformArea({
  pixelsPerBeat,
  gridSnap,
  scrollX,
  viewportWidth,
  audioDuration,
  audioOffset,
  audioFileName,
  tempo,
  playheadBeat,
  audioPeaks,
  height,
  beatsPerBar,
  onOffsetChange,
  onHeightChange,
}: {
  pixelsPerBeat: number;
  gridSnap: GridSnap;
  scrollX: number;
  viewportWidth: number;
  audioDuration: number;
  audioOffset: number;
  audioFileName: string | null;
  tempo: number;
  playheadBeat: number;
  audioPeaks: number[];
  height: number;
  beatsPerBar: number;
  onOffsetChange: (offset: number) => void;
  onHeightChange: (height: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ x: number; startOffset: number } | null>(null);
  const resizeStartRef = useRef<{ y: number; startHeight: number } | null>(
    null,
  );

  // Generate vertical grid background for audio track
  const verticalGridLayers = generateVerticalGridLayers(
    pixelsPerBeat,
    gridSnap,
    scrollX,
    beatsPerBar,
  );
  const gridBackgroundStyle: React.CSSProperties = {
    backgroundColor: "rgb(38 38 38)", // neutral-800 in Tailwind
    backgroundImage: verticalGridLayers
      .map(([gradient]) => gradient)
      .join(", "),
    backgroundSize: verticalGridLayers.map(([, size]) => size).join(", "),
    backgroundPosition: verticalGridLayers
      .map(([, , position]) => position)
      .join(", "),
  };

  // Convert audio duration/offset to beats for positioning
  const audioDurationBeats = secondsToBeats(audioDuration, tempo);
  const audioOffsetBeats = secondsToBeats(audioOffset, tempo);

  // Calculate screen positions
  const audioStartX = (audioOffsetBeats - scrollX) * pixelsPerBeat;
  const audioWidth = audioDurationBeats * pixelsPerBeat;

  // Playhead position
  const playheadX = (playheadBeat - scrollX) * pixelsPerBeat;
  const showPlayhead = playheadX >= 0 && playheadX <= viewportWidth;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (audioDuration === 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, startOffset: audioOffset };
  };

  useWindowEvent("mousemove", (e) => {
    if (!isDragging || !dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    // Moving right increases offset (audio moves right on timeline)
    const deltaBeats = deltaX / pixelsPerBeat;
    const deltaSeconds = beatsToSeconds(deltaBeats, tempo);
    const newOffset = Math.max(
      0,
      dragStartRef.current.startOffset + deltaSeconds,
    );
    onOffsetChange(newOffset);
  });

  useWindowEvent("mouseup", () => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStartRef.current = null;
  });

  // Resize handler
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = { y: e.clientY, startHeight: height };
  };

  useWindowEvent("mousemove", (e) => {
    if (!isResizing || !resizeStartRef.current) return;
    const deltaY = e.clientY - resizeStartRef.current.y;
    const newHeight = Math.max(
      MIN_WAVEFORM_HEIGHT,
      Math.min(
        MAX_WAVEFORM_HEIGHT,
        resizeStartRef.current.startHeight + deltaY,
      ),
    );
    onHeightChange(newHeight);
  });

  useWindowEvent("mouseup", () => {
    if (!isResizing) return;
    setIsResizing(false);
    resizeStartRef.current = null;
  });

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-b border-neutral-700 overflow-hidden"
      style={{ height, ...gridBackgroundStyle }}
    >
      {/* Audio region block */}
      {audioDuration > 0 && (
        <div
          className={`absolute top-1 bottom-1 rounded cursor-ew-resize overflow-hidden opacity-85 ${
            isDragging
              ? "bg-emerald-600"
              : "bg-emerald-700 hover:bg-emerald-600"
          }`}
          style={{
            left: audioStartX,
            width: Math.max(audioWidth, 4),
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Waveform SVG */}
          {audioPeaks.length > 0 && (
            <Waveform
              peaks={audioPeaks}
              height={height - 8} // Account for top-1 bottom-1 padding
            />
          )}
          {/* File name and offset indicator */}
          <div className="absolute left-1 top-0.5 text-[10px] text-emerald-200 whitespace-nowrap z-10">
            {audioFileName && <span className="mr-1.5">{audioFileName}</span>}
            {audioOffset > 0 && (
              <span className="opacity-75">+{audioOffset.toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
      {/* Playhead */}
      {showPlayhead && (
        <div
          className="absolute top-0 bottom-0 w-px bg-sky-400 pointer-events-none"
          style={{ left: playheadX }}
        />
      )}
      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-neutral-600 transition-colors"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}

// Waveform SVG component - renders peaks as a filled polygon
// Downsamples peaks to max ~500 points to avoid SVG lag
function Waveform({ peaks, height }: { peaks: number[]; height: number }) {
  if (peaks.length === 0) return null;

  // Downsample to max 500 points for performance
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(peaks.length / maxPoints));
  const sampledPeaks: number[] = [];

  for (let i = 0; i < peaks.length; i += step) {
    // Take max of this chunk for accuracy
    let max = 0;
    for (let j = i; j < Math.min(i + step, peaks.length); j++) {
      if (peaks[j] > max) max = peaks[j];
    }
    sampledPeaks.push(max);
  }

  // Use viewBox coordinates (0-1000 for x, 0-height for y)
  const viewBoxWidth = 1000;
  const centerY = height / 2;
  const maxAmplitude = centerY * 0.9; // Leave some margin

  // Create path points for upper and lower halves
  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];

  for (let i = 0; i < sampledPeaks.length; i++) {
    // X position scaled to viewBox width
    const x = (i / (sampledPeaks.length - 1 || 1)) * viewBoxWidth;
    const amplitude = sampledPeaks[i] * maxAmplitude;

    upperPoints.push(`${x},${centerY - amplitude}`);
    lowerPoints.unshift(`${x},${centerY + amplitude}`);
  }

  // Close the path by connecting upper and lower halves
  const pathData = `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${viewBoxWidth} ${height}`}
      preserveAspectRatio="none"
    >
      <path
        d={pathData}
        fill="rgba(255, 255, 255, 0.3)"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth="1"
      />
    </svg>
  );
}
