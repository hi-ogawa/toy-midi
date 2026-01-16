# Project-Level Persistence System

## Problem

Current localStorage-based persistence has limitations:

- **Storage quota**: ~5-10MB per domain (browser-dependent)
- **Data loss risk**: Browser data clear wipes all projects
- **No portability**: Cannot share/backup projects across devices
- **No import**: Can export MIDI but cannot import existing MIDI files

## Goals

1. Export complete project as a single portable file (including audio)
2. Import project files to restore full state
3. Import MIDI files to create notes from existing compositions
4. Maintain backward compatibility with current localStorage system

## Design Decisions

### File Format: `.toymidi` (ZIP-based)

A `.toymidi` file is a ZIP archive containing:

```
project.toymidi/
├── manifest.json      # Version, metadata, file references
├── project.json       # SavedProject data (notes, settings, etc.)
└── audio/             # Optional audio files
    └── track.wav      # Original audio file (if present)
```

**Why ZIP?**

- Standard format with native browser support (JSZip library)
- Allows bundling binary audio with JSON metadata
- Easy to inspect/debug (can open in any ZIP tool)
- Compresses well (especially for JSON data)

**Alternative considered**: Base64-encoded JSON

- Pros: Single file, no library needed
- Cons: 33% larger, slow encode/decode for large audio

### Manifest Schema

```typescript
interface ProjectManifest {
  version: 2; // Bump from SavedProject v1
  formatVersion: 1; // .toymidi format version
  exportedAt: string; // ISO timestamp
  name: string; // Project name
  files: {
    project: "project.json";
    audio?: string; // e.g., "audio/track.wav"
  };
}
```

### Export Flow

1. User clicks "Export Project" in menu
2. Collect current `SavedProject` state
3. If audio exists, fetch blob from IndexedDB
4. Create ZIP with manifest, project.json, and audio
5. Trigger download as `{project-name}-{timestamp}.toymidi`

### Import Flow

1. User clicks "Import Project" or drops file
2. Validate ZIP structure and manifest version
3. Parse project.json, apply migrations if needed
4. If audio present, save to IndexedDB, get new asset key
5. Create new project entry in localStorage
6. Redirect to new project

### MIDI Import (Separate Feature)

Import `.mid` files to create notes:

1. User clicks "Import MIDI" or drops .mid file
2. Parse using `@tonejs/midi` (already a dependency)
3. Extract notes from all tracks (or let user choose track)
4. Convert tick timings to beat positions using file's tempo
5. Options dialog:
   - Replace all notes vs. append
   - Import tempo from file vs. keep current
   - Track selection (if multi-track)
6. Create notes in store

## Implementation Plan

### Unified Import/Export Modal

Instead of scattering import/export options across menus, consolidate into a single modal:

**Modal Structure:**

```
┌─────────────────────────────────────────────────────┐
│  Import / Export                              [X]   │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐                           │
│  │ Import  │ │ Export  │  ← Tab switcher           │
│  └─────────┘ └─────────┘                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  EXPORT TAB:                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Format:  ○ Project (.toymidi)               │   │
│  │          ○ MIDI (.mid)                      │   │
│  │          ○ ABC Notation (.abc)              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ What to export:                             │   │
│  │   ☑ Notes (42 notes)                        │   │
│  │   ☑ Audio track (backing.wav)               │   │
│  │   ☑ Settings (tempo, time signature)        │   │
│  │   ☐ Selected notes only (12 selected)       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Copy to Clipboard]  [Download]                   │
│   (ABC only)                                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  IMPORT TAB:                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │        Drop file here or click to browse    │   │
│  │        .toymidi, .mid, .wav, .mp3           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  After file selected (MIDI example):               │
│  ┌─────────────────────────────────────────────┐   │
│  │ song.mid - 3 tracks, 156 notes              │   │
│  │                                             │   │
│  │ Track: [Track 1 - Bass ▼]                   │   │
│  │                                             │   │
│  │ ○ Replace current notes                     │   │
│  │ ○ Append to current notes                   │   │
│  │                                             │   │
│  │ ☑ Import tempo (120 BPM)                    │   │
│  │ ☑ Import time signature (4/4)              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Cancel]  [Import]                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Smart file type detection on import:**

- `.toymidi` → Full project restore (creates new project or replaces current)
- `.mid` → MIDI import with track selection
- `.wav/.mp3` → Audio track import (existing flow, moved here)

### Phase 1: Modal + Project Export/Import

**Files to create/modify:**

| File                                     | Changes                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/components/import-export-modal.tsx` | **New** - Unified modal component                             |
| `src/lib/project-file.ts`                | **New** - ZIP creation/parsing                                |
| `src/lib/project-manager.ts`             | Add `importProject()` function                                |
| `src/components/transport.tsx`           | Replace scattered items with single "Import/Export..." button |
| `src/lib/midi-export.ts`                 | Keep as-is, called from modal                                 |
| `src/lib/abc-export.ts`                  | Keep as-is, called from modal                                 |

**Dependencies:**

- Add `jszip` package (~90KB gzipped)

**Implementation steps:**

1. Install jszip: `pnpm add jszip`
2. Create `project-file.ts`:
   - `exportProject(projectId): Promise<Blob>` - creates ZIP
   - `parseProjectFile(file: File): Promise<ImportedProject>` - validates/extracts
3. Create `import-export-modal.tsx`:
   - Tab state (import/export)
   - Export: format selector, content checkboxes, download/copy buttons
   - Import: drag-drop zone, file type detection, format-specific options
4. Add `importProject()` to project-manager.ts
5. Update transport.tsx:
   - Remove individual export menu items
   - Add single "Import/Export..." menu item that opens modal
6. Move audio file import into modal (currently in transport.tsx)

### Phase 2: MIDI Import

**Files to create:**

| File                     | Changes                                 |
| ------------------------ | --------------------------------------- |
| `src/lib/midi-import.ts` | **New** - MIDI parsing, note conversion |

**Implementation steps:**

1. Create `midi-import.ts`:
   - `parseMidiFile(file: File): Promise<ParsedMidi>` - extracts tracks/notes
   - `convertMidiToNotes(parsed, options): Note[]` - converts to internal format
2. Add MIDI import UI to import tab in modal:
   - Track selection dropdown
   - Replace/append radio
   - Tempo/time signature import checkboxes
3. Wire up import action

### Phase 3: Enhancements (Future)

- Drag-drop zone on startup screen (opens modal with file pre-loaded)
- Export selected notes only
- Batch export all projects
- Recent files list (File System Access API)

## File Structure After Implementation

```
src/
├── components/
│   ├── import-export-modal.tsx  # NEW: Unified import/export UI
│   └── transport.tsx            # Modified: single menu item to open modal
└── lib/
    ├── project-manager.ts       # localStorage operations (existing + importProject)
    ├── project-file.ts          # NEW: .toymidi ZIP export/import
    ├── asset-store.ts           # IndexedDB audio storage (existing)
    ├── midi-export.ts           # MIDI export (existing, called from modal)
    ├── midi-import.ts           # NEW: MIDI import/parsing
    └── abc-export.ts            # ABC export (existing, called from modal)
```

## Migration Strategy

### SavedProject v1 → v2

No breaking changes needed. The `.toymidi` format is additive:

- Existing localStorage projects continue to work
- Import creates new projects with same v1 SavedProject structure
- `formatVersion` in manifest is separate from `version` in SavedProject

### Future-proofing

- Manifest has `formatVersion` for ZIP structure changes
- SavedProject has `version` for data schema changes
- Import code checks both and applies migrations

## Error Handling

| Scenario            | Behavior                                 |
| ------------------- | ---------------------------------------- |
| Invalid ZIP         | Toast: "Invalid project file"            |
| Missing manifest    | Toast: "Incompatible file format"        |
| Unsupported version | Toast: "File requires newer app version" |
| Corrupted audio     | Import project without audio, warn user  |
| MIDI parse error    | Toast: "Could not parse MIDI file"       |

## Testing Strategy

**Unit tests (`src/lib/`):**

- `project-file.test.ts` - ZIP creation/parsing, manifest validation
- `midi-import.test.ts` - MIDI parsing, note conversion

**E2E tests:**

- Export project → Import in new session → Verify notes match
- Import MIDI file → Verify notes created correctly
- Drag-drop .toymidi file → Project loads

## Open Questions

1. **Audio compression**: Should we compress audio in ZIP?
   - WAV files compress well (~50% reduction)
   - MP3s are already compressed, no benefit
   - Decision: Let JSZip use default compression

2. **Large audio files**: What if audio is >50MB?
   - Current: Proceed anyway (browser handles it)
   - Future: Add progress indicator, consider chunked download

3. **Multi-track MIDI import**: How to handle drums/multiple instruments?
   - Phase 2: Simple dialog with track selection
   - Future: Could import as multiple "layers" if we add multi-track support

---

## Status

- [x] Phase 1: Project Export/Import
- [x] Phase 2: MIDI Import
- [ ] Phase 3: Enhancements

**Feedback log:**

- 2026-01-17: User suggested unified Import/Export modal instead of scattered menu items. Updated plan with modal design that consolidates all import/export functionality (project, MIDI, ABC, audio) into single tabbed interface.
- 2026-01-17: Implementation complete. Created unified Import/Export modal with:
  - Export: Project (.toymidi), MIDI (.mid), ABC (.abc) formats
  - Import: .toymidi project files, .mid MIDI files (with track selection), audio files (.wav, .mp3)
  - Consolidated all import/export from transport menu into single modal
