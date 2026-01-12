# Event Handler Hooks Refactoring v2

**Date**: 2026-01-12
**Status**: Complete

## Problem

PR #43 introduced custom hooks (`useKeyboardShortcut`, `useMouseDrag`, etc.) to reduce `useEffect` boilerplate. However, the API is over-engineered with complex options objects (`KeyboardShortcutOptions`) and manual dependency arrays.

## Design Goals

1. Minimal API - just wrap subscribe/unsubscribe pattern
2. Use `useEffectEvent` (React 19.2+) for stable callbacks - no deps needed
3. Caller has full control over event handling logic
4. No magic options - pass through native `AddEventListenerOptions`

## Proposed Hooks

### `useWindowEvent`

Thin wrapper for window event listeners:

```tsx
function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    window.addEventListener(type, onEvent, options);
    return () => window.removeEventListener(type, onEvent, options);
  }, []); // type and options assumed static
}
```

### `useElementEvent`

Returns a ref callback (React 19 supports cleanup functions in ref callbacks):

```tsx
function useElementEvent<K extends keyof HTMLElementEventMap>(
  type: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  const onEvent = useEffectEvent(handler);

  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.addEventListener(type, onEvent, options);
    return () => el.removeEventListener(type, onEvent, options);
  }, []);
}
```

## Usage Examples

### Keyboard shortcuts

```tsx
// Before (v1 - complex options)
useKeyboardShortcut(
  {
    key: "Escape",
    preventDefault: true,
    stopPropagation: true,
    capture: true,
    enabled: isHelpOpen,
  },
  () => setIsHelpOpen(false),
  [isHelpOpen],
);

// After (v2 - caller controls everything)
useWindowEvent(
  "keydown",
  (e) => {
    if (e.key === "Escape" && isHelpOpen) {
      e.preventDefault();
      e.stopPropagation();
      setIsHelpOpen(false);
    }
  },
  true,
); // capture
```

### Mouse drag

```tsx
// Before (v1)
useMouseDrag(
  {
    enabled: isDragging,
    onMove: handleMouseMove,
    onEnd: handleMouseUp,
  },
  [isDragging, handleMouseMove, handleMouseUp],
);

// After (v2)
useWindowEvent("mousemove", (e) => {
  if (!isDragging) return;
  // handle move
});

useWindowEvent("mouseup", (e) => {
  if (!isDragging) return;
  setIsDragging(false);
});
```

### Element events (wheel with passive: false)

```tsx
const wheelRef = useElementEvent(
  "wheel",
  (e) => {
    e.preventDefault();
    handleZoom(e.deltaY);
  },
  { passive: false },
);

<div ref={wheelRef} />;

// For multiple events on same element, use mergeRefs:
const clickRef = useElementEvent("click", handleClick);
<div ref={mergeRefs(wheelRef, clickRef)} />;
```

### Window resize

```tsx
useWindowEvent("resize", () => {
  updateDimensions();
});

// If immediate call on mount is needed, just call it:
useEffect(() => {
  updateDimensions();
}, []);
```

## What Gets Removed

- `useKeyboardShortcut` - replaced by `useWindowEvent("keydown", ...)`
- `useMouseDrag` - replaced by two `useWindowEvent` calls
- `useWindowResize` - replaced by `useWindowEvent("resize", ...)`
- `KeyboardShortcutOptions` type
- `MouseDragOptions` type
- Manual `deps` parameter on all hooks

## Implementation Steps

1. Create `src/hooks/use-window-event.ts`
2. Create `src/hooks/use-element-event.ts`
3. Refactor `app.tsx` to use new hooks
4. Refactor `transport.tsx` to use new hooks
5. Refactor `piano-roll.tsx` to use new hooks
6. Delete old hook files
7. Run `pnpm tsc && pnpm lint`
8. Run tests

## Status

- [x] Design approved
- [x] Implementation complete
- [x] Tests passing (52 E2E tests, 7 unit tests)

## Notes

- `useElementEvent` was created but not used in the refactoring since the wheel handler in `piano-roll.tsx` shares `containerRef` with other code that needs bounding rect calculations. Kept the `useEffect` pattern for that case.
- All other window event handlers converted to `useWindowEvent`.
