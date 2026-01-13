# Keyboard Shortcut Patterns in DAW App

**Date**: 2026-01-14
**Related**: `docs/2026-01-12-event-handler-hooks-refactor-v2.md` (previous `useWindowEvent` refactor)

## Context

The v2 hooks refactor introduced `useWindowEvent` as a minimal primitive. Now we're considering a higher-level `useKeyboardShortcut` abstraction. Before implementing, we need to understand the different shortcut patterns in a DAW context.

## Shortcut Patterns

### Pattern 1: Global App Shortcuts

**Characteristics:**

- Always active regardless of selection state
- Unconditional action (always does something)
- Always `preventDefault` (claim key from browser)
- Always skip text input focus (intrinsic)
- Always ignore key repeat

**Examples:**
| Shortcut | Action |
|----------|--------|
| Space | Toggle playback |
| Ctrl+F | Toggle auto-scroll/follow |
| L | Add locator at playhead |

**Note:** These shortcuts define the "app identity" - they work the same way everywhere.

### Pattern 2: Selection-Dependent Shortcuts

**Characteristics:**

- Action depends on current selection state
- May do nothing if nothing is selected
- `preventDefault` only when action actually executes (or always for Ctrl+\* to block browser)
- Skip text input focus
- Ignore key repeat

**Examples:**
| Shortcut | Action | Condition |
|----------|--------|-----------|
| Delete/Backspace | Delete selected item | If notes/locator/audio selected |
| Escape | Clear selection | Always (but no-op if nothing selected) |
| Ctrl+C | Copy selected notes | If notes selected |
| Ctrl+V | Paste at playhead | If clipboard has notes |

### Pattern 3: History Shortcuts (Undo/Redo)

**Characteristics:**

- Always `preventDefault` (block browser undo/redo in app context)
- Action conditional on history state (`canUndo()`, `canRedo()`)
- Skip text input focus - **important**: allows browser text editing undo to work in input fields
- Ignore key repeat (debatable - some apps allow hold-to-repeat undo)

**Examples:**
| Shortcut | Action | Condition |
|----------|--------|-----------|
| Ctrl+Z | Undo | If `canUndo()` |
| Ctrl+Y | Redo | If `canRedo()` |
| Ctrl+Shift+Z | Redo | If `canRedo()` |

**DAW-specific note:** In a DAW, undo/redo is for editing operations (notes, regions, etc.), not text. When focused on a text input (e.g., tempo input, project name), browser's native text undo should work instead.

## Common Behaviors (All Patterns)

1. **Skip text input focus** - When typing in `<input>` or `<textarea>`, shortcuts don't fire. Exception: `<input type="range">` (sliders) since they don't accept text.

2. **Ignore key repeat** - Holding a key shouldn't rapid-fire the action. (Exception: future navigation shortcuts like arrows)

## Current Implementation Issues

1. **Inconsistent `e.repeat` checks** - transport.tsx has them, piano-roll.tsx doesn't
2. **Boilerplate duplication** - Text input guard repeated in every handler
3. **Mixed `e.key` vs `e.code`** - piano-roll uses `e.key`, transport uses `e.code`

## Key Format

Use `e.code` for layout-independent matching:

- Simple keys: `"Space"`, `"Delete"`, `"Backspace"`, `"Escape"`
- Letters: `"KeyZ"`, `"KeyF"`, `"KeyL"` (not `"z"`, `"Z"`)
- With modifiers: `"Ctrl+KeyZ"`, `"Ctrl+Shift+KeyZ"`

This ensures shortcuts work regardless of keyboard layout (QWERTY, AZERTY, etc.).

## Hook Design Options

### Option A: Single hook with callback control

```typescript
// Hook handles: text input guard, repeat ignore
// Callback handles: preventDefault, conditional logic
useKeyboardShortcut("Space", (e) => {
  e.preventDefault();
  togglePlayback();
});

useKeyboardShortcut("Delete", (e) => {
  if (selectedNoteIds.size > 0) {
    deleteNotes(Array.from(selectedNoteIds));
  }
  // No preventDefault if nothing happened
});
```

**Pros:** Simple API, flexible
**Cons:** Caller must remember to call `preventDefault`

### Option B: Pattern-specific hooks

```typescript
// Global shortcuts - always preventDefault
useGlobalShortcut("Space", () => togglePlayback());

// Selection shortcuts - callback decides
useEditShortcut("Delete", (e) => {
  if (selectedNoteIds.size > 0) {
    deleteNotes(...);
    return true; // handled
  }
  return false; // not handled, don't preventDefault
});
```

**Pros:** Explicit patterns, harder to misuse
**Cons:** More API surface, might be over-engineered (v1 flashback)

### Option C: Stick with useWindowEvent

Keep current minimal approach, just document patterns.

**Pros:** No new abstraction
**Cons:** Boilerplate remains, easy to forget repeat/text-input checks

## Recommendation

**Option A** - Single `useKeyboardShortcut` hook that handles the common boilerplate (text input guard, repeat ignore), while callback controls `preventDefault` and conditional logic.

This balances abstraction with flexibility, avoids v1's over-engineering, and properly handles all three patterns.

## Status

- [x] Pattern analysis
- [ ] Decide on hook design
- [ ] Implementation
- [ ] Migration
