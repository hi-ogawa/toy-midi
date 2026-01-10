# Help Overlay Implementation

## Problem Context

Implement a help overlay that:

- Shows all keyboard shortcuts and mouse actions
- Triggered by clicking `?` button in transport bar
- Dismissed by clicking close button, clicking backdrop, or pressing `Escape`
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
4. Add `?` button to transport bar to show overlay
5. Update existing components to reference config (optional but recommended for consistency)

## Implementation Steps

- [x] Create task doc and plan
- [x] Create keybindings config file
- [x] Create help overlay component
- [x] Add `?` button to transport bar
- [x] Add E2E test for help overlay
- [x] Manual verification with screenshots

## Implementation Notes

- Help button added to transport bar (right side, after metronome toggle)
- Escape key closes help overlay when open
- Help overlay z-index: 50 (higher than other components)
- Removed pan/zoom hint from piano-roll (now shown in help overlay)

## Status

✅ Complete - All tests passing, feature implemented and verified.
