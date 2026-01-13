# Reduce Re-render Blast Radius

**Date**: 2026-01-13
**Status**: Analysis Complete - Ready for Implementation

## Problem

During audio playback and continuous viewport scroll/zoom, excessive React re-renders occur due to:

1. **RAF loop state updates**: `useTransport` hook updates state at 60fps, causing all consumers to re-render
2. **Monolithic Zustand store**: Viewport state changes trigger re-renders in components that don't use viewport data

## Analysis

### 1. RAF Loop in `use-transport.ts` (lines 14-67)

**Current behavior**:

```typescript
const [transportState, setTransportState] = useState(() => deriveState());
// RAF loop calls setTransportState({ isPlaying, position }) every frame
```

**Problem**: Single state object containing both `isPlaying` (rarely changes) and `position` (60fps updates). Every component using `useTransport()` re-renders on position change.

**Affected components**:

- `PianoRoll` (line 288): needs position for auto-scroll + playhead
- `Transport` (line 131): needs position for time display
- Child components via props: `Timeline`, `WaveformArea`

The TODO comment (lines 15-20) already identifies this:

```typescript
// TODO:
// expose high frequency update should as a separate hook?
// or we should allow selector function to subscribe only partial state e.g.
// useTransport(s => s.isPlaying)
// useTransport(s => s.position)
```

### 2. Monolithic Zustand Store in `project-store.ts`

**Problem**: Viewport state mixed with project data (lines 41-50):

```typescript
scrollX: number; // horizontal offset
scrollY: number; // vertical offset
pixelsPerBeat: number; // horizontal zoom
pixelsPerKey: number; // vertical zoom
```

**Affected code**: `PianoRoll` (lines 239-285) destructures ~30+ values from `useProjectStore()`. Any viewport change triggers full component re-render and cascades to children.

### 3. Component Tree Re-renders

When `PianoRoll` re-renders at 60fps:

- `Keyboard` re-renders (props: scrollY, pixelsPerKey)
- `Timeline` re-renders (props: playheadBeat, scrollX, pixelsPerBeat)
- `WaveformArea` re-renders (props: playheadBeat, scrollX, pixelsPerBeat)
- All `NoteDiv` components re-render (props: scrollX, scrollY, pixelsPerBeat, pixelsPerKey)
- `generateGridBackground()` recalculates

## Proposed Solutions

### Solution A: Selector-based Transport Hook (Recommended)

Use `useSyncExternalStore` with selector pattern:

```typescript
// use-transport.ts
import { useSyncExternalStore } from "react";

const transportStore = {
  state: { isPlaying: false, position: 0 },
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  getSnapshot() {
    return this.state;
  },

  update(newState: TransportState) {
    this.state = newState;
    this.listeners.forEach((l) => l());
  },
};

// Selector hooks - only re-render when selected value changes
export function useIsPlaying() {
  return useSyncExternalStore(
    transportStore.subscribe.bind(transportStore),
    () => transportStore.getSnapshot().isPlaying,
  );
}

export function usePlaybackPosition() {
  return useSyncExternalStore(
    transportStore.subscribe.bind(transportStore),
    () => transportStore.getSnapshot().position,
  );
}
```

**Benefits**:

- Components only re-render when their subscribed value changes
- Transport component uses `useIsPlaying()` - no 60fps re-renders
- PianoRoll uses `usePlaybackPosition()` for playhead only

### Solution B: Zustand Selectors for Viewport State

Replace destructuring with individual selectors:

```typescript
// Before (re-renders on ANY store change)
const { scrollX, scrollY, pixelsPerBeat, notes, tempo } = useProjectStore();

// After (re-renders only when specific value changes)
const scrollX = useProjectStore((state) => state.scrollX);
const scrollY = useProjectStore((state) => state.scrollY);
const notes = useProjectStore((state) => state.notes);
```

**For complex selections, use shallow comparison**:

```typescript
import { useShallow } from "zustand/shallow";

const { scrollX, scrollY } = useProjectStore(
  useShallow((state) => ({ scrollX: state.scrollX, scrollY: state.scrollY })),
);
```

### Solution C: Ref-based Playhead (Optional Optimization)

For maximum performance, use ref + direct DOM manipulation for playhead:

```typescript
function Playhead({ tempo }: { tempo: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const update = () => {
      if (ref.current) {
        const position = Tone.getTransport().seconds;
        const beat = secondsToBeats(position, tempo);
        ref.current.style.left = `${(beat - scrollX) * pixelsPerBeat}px`;
      }
      rafId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(rafId);
  }, [tempo]);

  return <div ref={ref} className="playhead" />;
}
```

**Benefits**: Zero React re-renders for playhead animation.

### Solution D: Memoize Child Components

Add `React.memo` to prevent cascade re-renders:

```typescript
const NoteDiv = memo(function NoteDiv({ note, selected, ... }: NoteDivProps) {
  // ...
});

const Timeline = memo(function Timeline({ ... }: TimelineProps) {
  // ...
});
```

## Implementation Plan

### Phase 1: Transport Hook Refactor (High Impact)

1. Create `transportStore` using external store pattern
2. Add `useIsPlaying()` and `usePlaybackPosition()` hooks
3. Update `Transport` component to use `useIsPlaying()` only
4. Update `PianoRoll` to use `usePlaybackPosition()` for playhead

### Phase 2: Zustand Selectors (Medium Impact)

1. Identify viewport-only consumers
2. Convert destructuring to individual selectors
3. Use `useShallow` for grouped selections

### Phase 3: Component Memoization (Low-Medium Impact)

1. Wrap `NoteDiv` with `React.memo`
2. Wrap `Timeline`, `Keyboard`, `WaveformArea` with `React.memo`
3. Ensure stable callback references with `useCallback`

### Phase 4: Optional - Ref-based Playhead

1. Extract playhead into separate component
2. Use RAF loop with direct DOM manipulation
3. Remove position from React render cycle entirely

## Metrics

Before/after comparison using React DevTools Profiler:

- Count re-renders per second during playback
- Count re-renders during continuous scroll/zoom
- Measure frame time for RAF updates

## References

- [Zustand: Extracting state with selectors](https://docs.pmnd.rs/zustand/guides/slices-pattern)
- [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- Signal project (refs/signal) for similar patterns
