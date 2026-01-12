# Locators to Mark Parts

## Problem Context

Users transcribing music need to mark different sections of their song (verse, chorus, bridge, intro, outro, etc.) to navigate efficiently during the transcription workflow. This is a standard DAW feature.

## Requirements

From PRD user workflow:

- Mark song sections with locators
- Locators should be visible on the timeline
- Locators should help with navigation

## Reference Implementation

Based on common DAW patterns:

- Locators appear on the timeline as markers
- Each locator has a position (in beats) and a label (text)
- Users can click on the timeline to add a locator
- Locators should be movable (drag to reposition)
- Locators should be editable (double-click to rename)
- Locators should be deletable (delete key when selected, or context menu)
- Clicking a locator can optionally seek to that position

## Data Model

Add to `types.ts`:

```typescript
export interface Locator {
  id: string;
  position: number; // beats
  label: string;
}
```

## State Management

Add to `project-store.ts`:

```typescript
// In ProjectState interface:
locators: Locator[];

// Actions:
addLocator: (locator: Locator) => void;
updateLocator: (id: string, updates: Partial<Omit<Locator, "id">>) => void;
deleteLocator: (id: string) => void;
```

## UI Implementation

### Visual Design

- Render locators in the Timeline component (or as an overlay)
- Display as vertical markers with labels
- Visual style: small flag icon or triangle marker at top, optional label below
- Selected locator gets highlight/border
- Colors: use theme colors (sky-400 for markers, similar to playhead)

### Interactions

1. **Add**: Right-click on timeline → context menu → "Add Locator"
2. **Select**: Click on locator marker
3. **Move**: Drag locator marker horizontally
4. **Edit label**: Double-click locator → inline text edit
5. **Delete**: Select locator → press Delete/Backspace
6. **Seek**: Click locator (optional, or Shift+click)

### Component Structure

```
Timeline
├── (existing bar markers and playhead)
└── Locators (new)
    └── LocatorMarker (one per locator)
        ├── Marker visual (triangle/flag)
        └── Label text
```

## Implementation Steps

1. Add Locator type to `types.ts`
2. Add locator state and actions to `project-store.ts`
3. Add locator counter and ID generator (similar to notes)
4. Update Timeline component to render locators
5. Add locator interaction handlers:
   - Context menu for adding (or simple click action)
   - Click to select
   - Drag to move
   - Double-click to edit label
   - Delete key handler
6. Style locators to match app theme
7. Ensure locators persist with project state
8. Add E2E tests for basic locator operations

## Minimal-Change Approach

- Start with basic add/display/delete functionality
- Keep UI simple: small visual marker + text label
- Defer advanced features:
  - Context menu (use simple modifier key like Alt+click or double-click empty timeline area)
  - Inline editing (can start with prompt() for MVP)
  - Complex drag interactions (can be added later)
  - Seek on click (can be added later)

## MVP Features for First Implementation

1. Double-click empty timeline area → add locator with default label "Section 1", "Section 2", etc.
2. Render locator as small triangle marker at position with label below
3. Click locator → select (visual highlight)
4. Press Delete/Backspace → delete selected locator
5. Persist locators with project state

## Testing Strategy

E2E tests:

- Add locator by double-clicking timeline
- Verify locator appears at correct position
- Select and delete locator
- Verify locator persists after page reload

## Status

**Complete** - Implementation finished, tested, and reviewed

### What's Done

- ✅ Added Locator type to types.ts
- ✅ Added locator state and actions to project-store.ts (with ID generator and full persistence)
- ✅ Updated Timeline component to render locators with triangle markers
- ✅ Implemented interaction handlers:
  - Double-click timeline to add locator (auto-named "Section 1", "Section 2", etc.)
  - Click locator to select (changes color from sky-blue to amber)
  - Delete/Backspace key to delete selected locator
  - Escape key to deselect
- ✅ Styled with consistent theme colors (sky-400 default, amber-400 selected)
- ✅ Written 8 E2E tests (all passing)
- ✅ Manual testing with screenshots confirms feature works
- ✅ Code review completed with persistence issues fixed
- ✅ Security scan passed (0 alerts)
- ✅ All existing tests still pass (60/60)

### Remaining Work

None - feature is complete for MVP

### Future Enhancements (Deferred)

- Drag to reposition locators
- Double-click to rename inline (currently uses auto-generated names)
- Click locator to seek playhead to position
- Context menu for more options
- Undo/redo support for locator operations
