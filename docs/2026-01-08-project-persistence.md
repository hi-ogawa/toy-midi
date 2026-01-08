# Project Persistence

Save/load project state for quick workflow restoration.

## Problem

Losing work when refreshing or closing the browser. Need to:

1. Auto-save state to restore last session
2. Quick restore on page load

## Features

### 1. Auto-save to localStorage

- Save on every state change (debounced)
- Restore on page load

### 2. What to Save

```typescript
interface SavedProject {
  version: number; // Schema version for migration
  name: string;
  tempo: number;
  notes: Note[];
  gridSnap: GridSnap;
  // Audio file can't be saved (too large) - just save metadata
  audioFileName: string | null;
  audioOffset: number;
  // UI state
  waveformHeight: number;
}
```

**Not saved to localStorage:**

- Playback state (isPlaying, playheadPosition)
- audioPeaks (regenerated on audio load)

### 2. Audio Assets in IndexedDB

Store audio files separately in IndexedDB for full restore:

```typescript
// IndexedDB structure
database: "toy-midi"
  objectStore: "assets"
    key: hash(file) or filename
    value: { blob: Blob, name: string, size: number, addedAt: Date }

// Project references asset by key
interface SavedProject {
  // ...
  audioAssetKey: string | null; // Reference to IndexedDB asset
}
```

**Asset Management UI:**

- Show stored assets with size/date
- Allow purge of old/unused assets
- Warn when storage is getting full

## Design

### Storage Key

```typescript
const STORAGE_KEY = "toy-midi-project";
```

### Save Strategy

- Debounce saves (500ms) to avoid excessive writes
- Save to localStorage as JSON
- Include version number for future migrations

### Load Strategy

- On app mount, check localStorage
- If found, restore state
- Show toast/indicator when restored

## Implementation Steps

1. [ ] Add save/load functions in project-store
2. [ ] Add debounced auto-save effect
3. [ ] Add load on mount
4. [ ] Add waveformHeight to saved state
5. [ ] Test save/load cycle

## Files to Modify

| File                          | Changes                  |
| ----------------------------- | ------------------------ |
| `src/stores/project-store.ts` | save/load functions      |
| `src/app.tsx`                 | Load on mount, auto-save |

## Status

**Done** - Basic persistence implemented

### Completed

- localStorage for project state (notes, tempo, settings)
- IndexedDB for audio file storage
- Auto-save on state changes (500ms debounce)
- Auto-restore on page load (including audio)

### Future

- Asset management UI (list, delete, size info)
- Multiple project support (see below)

## Future: Project Management

Current: auto-load last session (quick dev workflow).

**Planned:**

1. **Project list on startup**
   - Show saved projects with name, date, note count
   - "New Project" button
   - "Continue Last" quick action

2. **Multiple projects**
   - Each project stored separately in IndexedDB
   - Project metadata in localStorage index
   - Share audio assets across projects (reference counting)

3. **Project operations**
   - Rename, duplicate, delete
   - Export/import as JSON (without audio)
   - Export with audio as zip (optional)

**Storage structure:**

```
localStorage:
  toy-midi-projects: { id, name, updatedAt }[]
  toy-midi-last-project: projectId

IndexedDB:
  projects: { id, ...projectData }
  assets: { key, blob, refCount }
```
