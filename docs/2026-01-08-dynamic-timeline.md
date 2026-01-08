# Dynamic Timeline

Make piano roll work for full song transcription (3-5 min songs, ~150 bars).

## Problem

Current implementation has fixed 8 bars (32 beats). Need:

- Timeline that spans audio duration
- Efficient rendering for long timelines
- Smooth scroll/zoom navigation

## Reference: Signal's Implementation

Analyzed `refs/signal` piano roll. Full WebGL-based DAW.

### Architecture

| Aspect     | Signal's Approach                                                |
| ---------- | ---------------------------------------------------------------- |
| Grid       | WebGL shader with modulo arithmetic (infinite pattern)           |
| Notes      | WebGL instanced rendering (single draw call for all notes)       |
| Scroll     | Custom scrollbars, Jotai atoms for state                         |
| Transforms | `TickTransform`/`KeyTransform` classes for tick↔pixel conversion |
| Filtering  | `EventView` class with range filtering synced to viewport        |

### Key Files

- `app/src/components/PianoRoll/PianoRoll.tsx` - wheel handling
- `app/src/components/PianoRoll/PianoRollCanvas/HorizontalGrid.tsx` - WebGL grid
- `app/src/hooks/useTickScroll.tsx` - scroll state
- `app/src/hooks/useNotes.tsx` - note filtering

### Wheel Handling (Signal)

```typescript
// From PianoRoll.tsx lines 89-113
- Ctrl/Alt + wheel: Horizontal zoom (scale X around mouse position)
- Shift + Ctrl/Alt + wheel: Vertical zoom
- No modifiers: Pan scroll (both axes)
- Touchpad detection with different scaling factors
- Zoom clamped to 0.15–15× range
```

### Grid Shader Approach

Fragment shader uses modulo to create infinite repeating pattern:

```glsl
float modY = mod(screenHeight - vPosition.y, height * 12.0);
// Check which octave lane to draw based on modY
```

### Note Rendering Pipeline

```
EventView (range-filtered by scroll)
  → filter(isNoteEvent)
  → map to PianoNoteItem (screen coords via transform)
  → WebGL instanced rendering
```

### Layout Constants

```typescript
Layout = {
  pixelsPerTick: 0.1, // 0.1px per MIDI tick
  keyHeight: 16, // px per key
  keyWidth: 64, // sidebar width
  rulerHeight: 32, // timeline height
};
```

## Decision: Simpler Approach

Signal is over-engineered for our needs (WebGL, instanced rendering, custom scrollbars). We have <500 notes for bass transcription.

| Aspect | Signal            | Toy-midi                     |
| ------ | ----------------- | ---------------------------- |
| Grid   | WebGL shader      | CSS repeating background     |
| Notes  | WebGL instanced   | SVG (filter visible)         |
| Scroll | Custom scrollbars | Native scroll container      |
| Zoom   | Custom transform  | Wheel events + CSS transform |
| State  | Jotai atoms       | Zustand (already using)      |

**Rationale:**

- CSS background pattern = zero render cost, infinite scaling
- SVG notes = simpler, React-friendly, sufficient for <500 notes
- Native scroll = less code, browser-optimized
- Wheel for zoom only, scroll via native container

## Approach

### Grid: CSS background pattern

```css
.grid {
  background-image:
    /* beat lines */
    repeating-linear-gradient(
      90deg,
      #404040 0 1px,
      transparent 1px var(--beat-width)
    ),
    /* bar lines (every 4 beats) */
    repeating-linear-gradient(
        90deg,
        #525252 0 1px,
        transparent 1px calc(var(--beat-width) * 4)
      ),
    /* row lines */
    repeating-linear-gradient(
        0deg,
        #404040 0 1px,
        transparent 1px var(--row-height)
      );
  background-size:
    var(--beat-width) 100%,
    calc(var(--beat-width) * 4) 100%,
    100% var(--row-height);
}
```

### Scroll: Native container

- Outer div with `overflow: auto`
- Inner div sized to `totalBeats * beatWidth` × `pitchCount * rowHeight`
- Keyboard stays sticky via `position: sticky`

### Zoom: Wheel events

| Input                | Action                   |
| -------------------- | ------------------------ |
| Wheel                | Native horizontal scroll |
| Ctrl + Wheel         | Horizontal zoom          |
| Shift + Wheel        | Native vertical scroll   |
| Ctrl + Shift + Wheel | Vertical zoom            |

### Notes: SVG with viewport filtering

```typescript
const visibleNotes = notes.filter((note) => {
  const noteEnd = note.start + note.duration;
  return noteEnd > viewportStart && note.start < viewportEnd;
});
```

### State changes

```typescript
// Add to project store
interface ViewportState {
  totalBeats: number; // timeline length (default 128 = 32 bars)
}

// Local component state (no need in store)
// scrollX, scrollY - from native scroll container
// zoomX, zoomY - already have in component
```

## Implementation Steps

1. [x] Add `totalBeats` to store (default 128 = 32 bars)
2. [x] Replace SVG grid with CSS background pattern
3. [x] Size inner container to `totalBeats * beatWidth`
4. [x] Add wheel event handler for Ctrl+wheel zoom
5. [ ] Filter notes to visible viewport range (deferred - not needed for <500 notes)
6. [x] Update timeline to use totalBeats prop
7. [ ] Test with long timeline (500+ beats)

## Feedback Log

### Attempt 1 observations

- **Dynamic vertical pitch range**: Currently fixed to E1-G3. Should expand based on content or user setting.
- **Native scroll vs fixed viewport**: Current approach creates huge scrollable area. Better approach:
  | Native scroll (current) | Fixed viewport (better) |
  | --------------------------- | ------------------------------------ |
  | Container = totalBeats wide | Viewport = window size |
  | Browser scrollbars | No scrollbars |
  | Scroll to navigate | Wheel to pan, Ctrl+wheel to zoom |
  | Zoom changes element sizes | Zoom changes what fits in viewport |
- **Fit to window**: Piano roll should fill available space, zoom determines how many beats visible.

### Next iteration

Revise to fixed viewport approach - editor fills window, pan/zoom to navigate content (like DAWs).

## Status

**Attempt 1 complete** - works but native scroll approach suboptimal

### Done

- `totalBeats` added to project-store.ts (default 128 = 32 bars)
- SVG grid replaced with CSS `repeating-linear-gradient` background
- Inner container sized dynamically based on `totalBeats * beatWidth`
- Wheel zoom: Ctrl+wheel for horizontal, Ctrl+Shift+wheel for vertical
- Timeline component accepts `totalBeats` prop
- Build passes (`pnpm tsc && pnpm lint`)

### Remaining

- Manual testing with `pnpm dev`
- Note viewport filtering (deferred - SVG handles <500 notes fine)
- E2E tests may need updates if grid behavior changed
