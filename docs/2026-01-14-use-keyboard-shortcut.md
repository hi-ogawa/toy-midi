# useKeyboardShortcut Hook

## Problem

Keyboard shortcut handling is scattered with repeated boilerplate:

```typescript
useWindowEvent("keydown", (e) => {
  // 1. Skip when typing in text inputs
  if (
    (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  // 2. Check key combo
  if (e.code === "Space" && !e.repeat) {
    // 3. Prevent browser default
    e.preventDefault();
    // 4. Execute action
    doSomething();
  }
});
```

Current codebase has 3 instances with inconsistent behavior (piano-roll.tsx missing `e.repeat` checks).

## Concept: What is a "keyboard shortcut"?

A keyboard shortcut is:

1. **Key combo** - the trigger (e.g., Space, Ctrl+Z)
2. **Action** - what happens when triggered
3. **Context-aware** - disabled when user is typing in text inputs (intrinsic to shortcuts)
4. **Behavior config** - repeat and preventDefault (per-shortcut)

### Text input guard (always on)

This is intrinsic to the concept of "app shortcut". When a user is typing in an input field, pressing Space should type a space, not toggle playback. The exception is `<input type="range">` (sliders) which don't accept text.

### `e.repeat` behavior

When a key is held down, the browser fires repeated `keydown` events. Whether to honor these depends on the shortcut's semantics:

| Shortcut                | Allow repeat? | Why                                            |
| ----------------------- | ------------- | ---------------------------------------------- |
| Space (play/pause)      | No            | Toggle should fire once, not rapidly toggle    |
| Ctrl+Z (undo)           | Maybe         | Some apps allow holding to undo multiple times |
| Delete                  | Maybe         | Could delete multiple items, but risky         |
| Arrow keys (navigation) | Yes           | Continuous movement is expected                |

**Default: `allowRepeat: false`** - safer, prevents accidental rapid-fire actions.

### `e.preventDefault()` behavior

Prevents the browser's default action for that key. Whether to call it depends on whether there's a conflicting browser behavior:

| Shortcut        | preventDefault? | Why                                          |
| --------------- | --------------- | -------------------------------------------- |
| Space           | Yes             | Otherwise scrolls the page                   |
| Ctrl+F          | Yes             | Otherwise opens browser Find dialog          |
| Ctrl+Z          | Yes             | Otherwise browser might undo in a text field |
| Delete          | No              | No conflicting browser behavior              |
| Escape          | No              | No conflicting browser behavior              |
| L (add locator) | No              | No conflicting browser behavior              |

**Default: `preventDefault: true`** - most shortcuts override browser behavior.

## API

```typescript
// Simple - defaults: allowRepeat=false, preventDefault=true
useKeyboardShortcut("Space", () => togglePlayback());

// Callback receives event for flexibility
useKeyboardShortcut(
  "Delete",
  (e) => {
    if (e.shiftKey) deleteAll();
    else deleteSelection();
  },
  { preventDefault: false },
);

// Allow repeat for navigation
useKeyboardShortcut("ArrowDown", () => moveDown(), { allowRepeat: true });
```

## Implementation

**File**: `src/hooks/use-keyboard-shortcut.ts`

```typescript
type Options = {
  allowRepeat?: boolean; // default: false
  preventDefault?: boolean; // default: true
};

function isTextInputFocused(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && target.type !== "range") ||
    target instanceof HTMLTextAreaElement
  );
}

export function useKeyboardShortcut(
  key: string,
  callback: (e: KeyboardEvent) => void,
  options: Options = {},
) {
  const { allowRepeat = false, preventDefault = true } = options;

  useWindowEvent("keydown", (e) => {
    if (isTextInputFocused(e.target)) return;
    if (!allowRepeat && e.repeat) return;
    if (!matchesKey(e, key)) return;

    if (preventDefault) e.preventDefault();
    callback(e);
  });
}
```

### Key matching

Use `e.code` for layout-independent keys:

- `"Space"`, `"Delete"`, `"Backspace"`, `"Escape"`
- `"KeyZ"`, `"KeyF"` for letters
- `"Ctrl+KeyZ"`, `"Ctrl+Shift+KeyZ"` for combos

## Migration

**transport.tsx**:

```typescript
// Before
useWindowEvent("keydown", (e) => {
  if (...textInputCheck...) return;
  if (e.code === "Space" && !e.repeat) {
    e.preventDefault();
    togglePlayback();
  }
});

// After
useKeyboardShortcut("Space", () => togglePlayback());
```

**piano-roll.tsx**:

- Migrate all shortcuts
- Fixes missing `e.repeat` checks (bug)

## Status

- [ ] Create `use-keyboard-shortcut.ts`
- [ ] Migrate transport.tsx shortcuts
- [ ] Migrate piano-roll.tsx shortcuts
- [ ] Verify all shortcuts work
