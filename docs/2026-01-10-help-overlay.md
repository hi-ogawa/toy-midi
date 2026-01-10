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
- [ ] Create keybindings config file
- [ ] Create help overlay component
- [ ] Add global keyboard handler for `?` key
- [ ] Add E2E test for help overlay
- [ ] Manual verification with screenshots

## Status

Planning phase - awaiting approval.
