# Help Overlay Implementation

## Problem Context

Implement a help overlay that:

- Shows all keyboard shortcuts and mouse actions
- Triggered by pressing `?` key
- Dismissed by pressing `?` again or `Escape`
- Code-generated from a centralized keybindings config

## Current State

Keyboard shortcuts are scattered across components:

- `src/components/transport.tsx`: Space (play/pause)
- `src/components/piano-roll.tsx`: Delete/Backspace (delete notes), Escape (deselect)

Mouse actions are documented in `docs/prd.md` but not in code.

## Approach

1. Create a centralized keybindings config file (`src/lib/keybindings.ts`)
2. Define all shortcuts (keyboard + mouse actions) with categories
3. Create a help overlay component that reads from config
4. Add `?` key handler to show/hide overlay
5. Update existing components to reference config (optional but recommended for consistency)

## Implementation Steps

- [x] Create task doc and plan
- [x] Create keybindings config file
- [x] Create help overlay component
- [x] Add global keyboard handler for `?` key
- [x] Add E2E test for help overlay
- [x] Manual verification with screenshots

## Implementation Notes

- Key handling: `?` key is detected as either `e.key === "?"` or `e.key === "/" && e.shiftKey` depending on browser/keyboard layout
- Event capture phase used to prevent conflicts with piano-roll Escape handler
- Help overlay z-index: 50 (higher than other components)

## Status

✅ Complete - All tests passing, feature implemented and verified.
