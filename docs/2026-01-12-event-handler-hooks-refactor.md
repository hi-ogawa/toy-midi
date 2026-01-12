# Event Handler Hooks Refactoring

**Date**: 2026-01-12
**Status**: Planning

## Problem

The codebase has repetitive `useEffect` + `window.addEventListener` patterns for keyboard shortcuts, dragging, and other window events. This creates boilerplate and makes the code harder to maintain.

## Current Patterns

### 1. Keyboard Shortcuts (3 instances)

**app.tsx** - Enter key for startup screen:
```tsx
useEffect(() => {
  if (!savedProjectExists || initMutation.isSuccess || initMutation.isPending)
    return;
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      // ... action
    }
  };
  
  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}, [dependencies]);
```

**app.tsx** - Escape key for help overlay:
```tsx
useEffect(() => {
  if (!isHelpOpen) return;
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsHelpOpen(false);
    }
  };
  
  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}, [isHelpOpen]);
```

**piano-roll.tsx** - Multiple shortcuts (Delete, Escape, Undo/Redo):
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Guard: Don't trigger if typing in an input
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    
    if (e.key === "Delete" || e.key === "Backspace") {
      // ... action
    } else if (e.key === "Escape") {
      // ... action
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      // ... redo
    } else if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
      // ... redo alternative
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      // ... undo
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [dependencies]);
```

**transport.tsx** - Space and Ctrl+F:
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Guard: Don't trigger if typing in an input
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      handlePlayPause();
    } else if (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.repeat) {
      e.preventDefault();
      handleAutoScrollToggle();
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handlePlayPause, handleAutoScrollToggle]);
```

### 2. Mouse Drag Handlers (4 instances)

**piano-roll.tsx** - Note dragging:
```tsx
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
```

**piano-roll.tsx** - Keyboard dragging:
```tsx
useEffect(() => {
  const handleMouseUp = () => {
    setIsDragging(false);
    lastPlayedPitch.current = null;
  };
  window.addEventListener("mouseup", handleMouseUp);
  return () => window.removeEventListener("mouseup", handleMouseUp);
}, []);
```

**piano-roll.tsx** - WaveformArea dragging (2x similar patterns):
```tsx
useEffect(() => {
  if (!isDragging) return;
  
  const handleMouseMove = (e: MouseEvent) => { /* ... */ };
  const handleMouseUp = () => { /* ... */ };
  
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  return () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };
}, [isDragging, ...dependencies]);
```

### 3. Other Window Events (2 instances)

**piano-roll.tsx** - Window resize:
```tsx
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
```

**piano-roll.tsx** - Wheel event (on container ref):
```tsx
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    // ... zoom/pan logic
  };
  
  container.addEventListener("wheel", handleWheel, { passive: false });
  return () => container.removeEventListener("wheel", handleWheel);
}, [dependencies]);
```

## Proposed Solutions

### Option 1: Custom Hooks (Recommended)

Create reusable hooks that encapsulate the event handler patterns:

#### `useKeyboardShortcut`
```tsx
// src/hooks/use-keyboard-shortcut.ts
import { useEffect } from "react";

type KeyboardShortcutOptions = {
  key?: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  capture?: boolean;
  ignoreInputs?: boolean;
  enabled?: boolean;
};

export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  callback: (e: KeyboardEvent) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    if (options.enabled === false) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Don't trigger if typing in an input (unless disabled)
      if (options.ignoreInputs !== false) {
        if (
          (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
      }
      
      // Check if key matches
      const keyMatches = options.key ? e.key === options.key : true;
      const codeMatches = options.code ? e.code === options.code : true;
      const ctrlMatches = options.ctrl !== undefined ? e.ctrlKey === options.ctrl : true;
      const metaMatches = options.meta !== undefined ? e.metaKey === options.meta : true;
      const shiftMatches = options.shift !== undefined ? e.shiftKey === options.shift : true;
      const altMatches = options.alt !== undefined ? e.altKey === options.alt : true;
      
      if (keyMatches && codeMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
        if (options.preventDefault) e.preventDefault();
        if (options.stopPropagation) e.stopPropagation();
        callback(e);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown, options.capture);
    return () => window.removeEventListener("keydown", handleKeyDown, options.capture);
  }, [options.enabled, ...deps]);
}
```

Usage:
```tsx
// Before
useEffect(() => {
  if (!isHelpOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsHelpOpen(false);
    }
  };
  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}, [isHelpOpen]);

// After
useKeyboardShortcut(
  { key: "Escape", preventDefault: true, stopPropagation: true, capture: true, enabled: isHelpOpen },
  () => setIsHelpOpen(false),
  [isHelpOpen]
);
```

#### `useMouseDrag`
```tsx
// src/hooks/use-mouse-drag.ts
import { useEffect } from "react";

type MouseDragOptions = {
  onMove?: (e: MouseEvent) => void;
  onEnd?: (e: MouseEvent) => void;
  enabled: boolean;
};

export function useMouseDrag(
  options: MouseDragOptions,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    if (!options.enabled) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      options.onMove?.(e);
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      options.onEnd?.(e);
    };
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [options.enabled, ...deps]);
}
```

Usage:
```tsx
// Before
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

// After
useMouseDrag(
  {
    enabled: dragMode.type !== "none",
    onMove: handleMouseMove,
    onEnd: handleMouseUp,
  },
  [dragMode, handleMouseMove, handleMouseUp]
);
```

#### `useWindowResize`
```tsx
// src/hooks/use-window-resize.ts
import { useLayoutEffect } from "react";

export function useWindowResize(
  callback: () => void,
  deps: React.DependencyList = []
) {
  useLayoutEffect(() => {
    callback(); // Call immediately
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }, deps);
}
```

Usage:
```tsx
// Before
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

// After
const updateSize = useCallback(() => {
  if (containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect();
    setViewportSize({ width: rect.width, height: rect.height });
  }
}, []);

useWindowResize(updateSize);
```

#### `useElementEvent`
```tsx
// src/hooks/use-element-event.ts
import { useEffect, type RefObject } from "react";

export function useElementEvent<K extends keyof HTMLElementEventMap>(
  ref: RefObject<HTMLElement>,
  eventType: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    element.addEventListener(eventType, handler as EventListener, options);
    return () => element.removeEventListener(eventType, handler as EventListener, options);
  }, [ref, eventType, options, ...deps]);
}
```

Usage:
```tsx
// Before
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    // ... logic
  };
  
  container.addEventListener("wheel", handleWheel, { passive: false });
  return () => container.removeEventListener("wheel", handleWheel);
}, [dependencies]);

// After
useElementEvent(containerRef, "wheel", handleWheel, { passive: false }, [dependencies]);
```

### Option 2: Declarative Shortcut Registry

Create a centralized shortcut registry that components can register with:

```tsx
// src/lib/shortcuts.ts
import { useEffect } from "react";

type Shortcut = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: (e: KeyboardEvent) => void;
  enabled?: () => boolean;
};

const shortcuts: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut) {
  shortcuts.push(shortcut);
  return () => {
    const index = shortcuts.indexOf(shortcut);
    if (index > -1) shortcuts.splice(index, 1);
  };
}

export function useShortcut(key: string, options: Omit<Shortcut, "key">) {
  useEffect(() => {
    return registerShortcut({ key, ...options });
  }, [key, options.enabled]);
}

// Setup global listener once in App
export function initShortcuts() {
  window.addEventListener("keydown", (e) => {
    for (const shortcut of shortcuts) {
      if (shortcut.enabled && !shortcut.enabled()) continue;
      // ... match logic and call action
    }
  });
}
```

## Recommendation

**Use Option 1** (Custom Hooks) because:

1. **More flexible**: Allows component-specific logic and dependencies
2. **Better type safety**: TypeScript can infer types from handler functions
3. **No global state**: Each component manages its own event handlers
4. **Easy to test**: Hooks can be tested independently
5. **Follows React patterns**: Uses standard useEffect patterns
6. **Minimal refactor**: Can be adopted incrementally

## Implementation Plan

1. Create custom hooks:
   - [ ] `use-keyboard-shortcut.ts` - Handle keyboard shortcuts with conditions
   - [ ] `use-mouse-drag.ts` - Handle mouse drag patterns (move + up)
   - [ ] `use-window-resize.ts` - Handle window resize
   - [ ] `use-element-event.ts` - Generic element event handler

2. Refactor components (incrementally):
   - [ ] app.tsx - Replace keyboard shortcuts (Enter, Escape)
   - [ ] transport.tsx - Replace keyboard shortcuts (Space, Ctrl+F)
   - [ ] piano-roll.tsx - Replace keyboard shortcuts (Delete, Escape, Undo/Redo)
   - [ ] piano-roll.tsx - Replace mouse drag handlers (note dragging, keyboard dragging)
   - [ ] piano-roll.tsx - Replace window resize handler
   - [ ] piano-roll.tsx - Replace wheel handler
   - [ ] WaveformArea - Replace drag handlers (audio offset, height resize)

3. Add tests:
   - [ ] Unit tests for custom hooks
   - [ ] Verify existing E2E tests still pass

## Notes

- Keep the `ignoreInputs` guard by default (don't trigger shortcuts when typing in inputs)
- Support both `key` and `code` for keyboard shortcuts (Space vs. "Space")
- Consider adding a `useKeyboardShortcuts` (plural) hook for multiple shortcuts in one call
- The wheel event on containerRef is slightly different (element vs window) - needs `useElementEvent`

## Status

- [x] Planning and research
- [ ] Implementation
- [ ] Testing
- [ ] Documentation
