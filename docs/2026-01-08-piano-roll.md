# Piano Roll Implementation

Phase 1: Static piano roll with note editing.

## Reference

- `docs/prd.md` - Full specs and UX decisions
- `refs/signal` - Signal's piano roll implementation (if cloned)

## Scope

Phase 1:

- Basic SVG rendering with grid
- Piano keyboard sidebar (bass range E1-G3)
- Grid snap control (1/4, 1/8, 1/16, triplets)
- Click-drag to create notes
- Note selection and deletion
- Note dragging (move/resize)
- E2E tests for editor interactions

## Data Model

```typescript
// src/types.ts
interface Note {
  id: string;
  pitch: number; // MIDI note number (E1=28, G3=55)
  start: number; // Start time in beats
  duration: number; // Duration in beats
  velocity: number; // 0-127, default 100
}

type GridSnap = "1/4" | "1/8" | "1/16" | "1/4T" | "1/8T" | "1/16T";

interface ProjectState {
  notes: Note[];
  selectedNoteIds: Set<string>;
  gridSnap: GridSnap;
  // Future: tempo, timeSignature, etc.
}
```

## Architecture

```
src/
├── types.ts                    # Note, GridSnap types
├── stores/
│   └── project-store.ts        # Zustand store
├── lib/
│   └── music.ts                # Pitch utilities (midiToNoteName, etc.)
├── components/
│   └── piano-roll.tsx          # All piano roll components
└── app.tsx                     # Root with PianoRoll
```

Keep components in single file initially - split only if too large.

## Layout

```
┌─────────────────────────────────────────────────────┐
│ [Grid: 1/4 ▼]  [Load Audio]  [BPM: 120]             │ Toolbar
├────────┬────────────────────────────────────────────┤
│        │  1     2     3     4     5     6     7     │ Timeline
│        │  ▼                                         │ (beat markers, locator)
├────────┼────────────────────────────────────────────┤
│ Audio  │ ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄  │ Waveform track
│        │                                            │ (backing track)
├────────┼────────────────────────────────────────────┤
│   G3   │ ░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░   │
│   F#3  │ ████│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░   │ Piano Roll
│   F3   │ ░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░   │ (MIDI notes)
│   ...  │                                            │
│   E1   │ ░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░│░░░░   │
└────────┴────────────────────────────────────────────┘
  Keyboard                    Grid
```

**Vertical sections (top to bottom):**

1. **Toolbar** - Grid snap, audio load, BPM, etc.
2. **Timeline** - Beat/bar markers, playhead, click to seek
3. **Waveform** - Backing track visualization (placeholder for Phase 1)
4. **Piano Roll** - Keyboard sidebar + note grid

## Constants

```typescript
// Layout heights
const TOOLBAR_HEIGHT = 48; // px
const TIMELINE_HEIGHT = 32; // px
const WAVEFORM_HEIGHT = 60; // px (placeholder for Phase 2)

// Piano roll dimensions
const KEYBOARD_WIDTH = 60; // px
const ROW_HEIGHT = 20; // px per semitone
const BEAT_WIDTH = 80; // px per beat (at 1/4 snap)
const VISIBLE_BARS = 8; // Default viewport width

// Bass range E1-G3 = MIDI 28-55 (28 semitones)
const MIN_PITCH = 28; // E1
const MAX_PITCH = 55; // G3
const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1; // 28 rows
```

## Implementation Steps

### Step 1: Types and Store

- Create `src/types.ts` with Note, GridSnap types
- Create `src/stores/project-store.ts` with Zustand
- Create `src/lib/music.ts` with pitch utilities

### Step 2: Layout Structure

- Create `src/components/piano-roll.tsx`
- Toolbar row (placeholder, grid snap later)
- Timeline row with beat/bar markers
- Waveform row (placeholder for Phase 2)
- Piano roll: keyboard sidebar + note grid
- SVG grid with horizontal lines (pitch rows)
- SVG grid with vertical lines (beat divisions)

### Step 3: Grid Snap Control

- Add toolbar with grid snap dropdown
- Visual grid updates based on snap setting

### Step 4: Note Creation

- Click-drag on empty area creates note
- Note start snaps to grid
- Note length extends with drag (snapped)
- Store note in Zustand

### Step 5: Note Selection

- Click note to select
- Shift+click to add to selection
- Click empty area to deselect all
- Box select (drag empty area)
- Visual selection highlight

### Step 6: Note Deletion

- Delete/Backspace removes selected notes

### Step 7: Note Dragging

- Drag note body: move (time + pitch)
- Drag left edge: resize start
- Drag right edge: resize end
- All movements snapped to grid

### Step 8: E2E Tests

- Test note creation via click-drag
- Test note selection
- Test note deletion
- Test note move/resize

## SVG Coordinate System

- Origin (0,0) at top-left
- X increases right (time)
- Y increases down (but pitch goes up, so invert)

```
Y coordinate for pitch p:
  y = (MAX_PITCH - p) * ROW_HEIGHT
```

## Interaction State Machine

```
Idle
  → MouseDown on empty → Creating
  → MouseDown on note body → MaybeSelecting (wait for drag)
  → MouseDown on note edge → Resizing

Creating
  → MouseMove → Update preview note length
  → MouseUp → Commit note, → Idle

MaybeSelecting
  → MouseMove (threshold) → Dragging
  → MouseUp (no move) → Select/toggle note, → Idle

Dragging
  → MouseMove → Update note position
  → MouseUp → Commit move, → Idle

Resizing
  → MouseMove → Update note duration
  → MouseUp → Commit resize, → Idle
```

## Feedback Log

- [x] Grid click feels half off - fixed with `Math.floor` instead of `Math.round`
- [x] Escape to deselect - added
- [x] Scale both vertically and horizontally - added zoom dropdowns
- [x] Sticky keyboard on horizontal scroll - added
- [ ] Copy/paste notes - deferred (needs transport state)

## Status

**Feature: Note Editing - Complete**

- Types (Note, GridSnap) in `src/types.ts`
- Zustand store in `src/stores/project-store.ts`
- Music utilities in `src/lib/music.ts`
- Piano roll component in `src/components/piano-roll.tsx`
- E2E tests in `e2e/piano-roll.spec.ts`

Capabilities:

- SVG-based grid with keyboard sidebar
- Grid snap control (1/4, 1/8, 1/16, triplets)
- Click-drag note creation
- Note selection (click, shift+click, box select)
- Note deletion (Delete/Backspace, Escape to deselect)
- Note dragging (move body, resize edges)
- Horizontal/Vertical zoom
- Sticky keyboard on scroll

**Next: Dynamic Timeline** - see `docs/prd.md`
