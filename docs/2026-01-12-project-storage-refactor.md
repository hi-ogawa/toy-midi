# Project Storage Layer Refactor

## Problem

The current project persistence code has mixed responsibilities and unclear layer boundaries.

## Starting Point

Add pure serialization functions to `project-store.ts`:

```typescript
// project-store.ts

// What gets saved to localStorage (project data only)
interface SavedProject {
  version: number;
  notes: Note[];
  tempo: number;
  timeSignature: TimeSignature;
  gridSnap: GridSnap;
  // ... audio, mixer, viewport settings
  // NO currentProjectId - that's the storage key, not data
  // NO selectedNoteIds, audioPeaks - transient state
}

function toSavedProject(state: ProjectState): SavedProject {
  // Extract only the persistable project data
}

function fromSavedProject(data: SavedProject): Partial<ProjectState> {
  // Convert saved data to state fields
  // Caller sets currentProjectId separately
}
```

Then orchestrator uses them:

```typescript
// app.tsx
function loadProject(projectId: string) {
  const json = localStorage.getItem(getProjectKey(projectId));
  const saved = JSON.parse(json) as SavedProject;
  const state = fromSavedProject(saved);
  useProjectStore.setState({
    currentProjectId: projectId, // set separately - not part of project data
    ...state,
  });
  setLastProjectId(projectId); // metadata concern
}

function saveProject() {
  const state = useProjectStore.getState();
  const saved = toSavedProject(state);
  localStorage.setItem(
    getProjectKey(state.currentProjectId),
    JSON.stringify(saved),
  );
  updateProjectMetadata(state.currentProjectId, { updatedAt: Date.now() });
}
```

### Key Insight: `currentProjectId` is not project data

| Field                           | Where it belongs | Why                                                            |
| ------------------------------- | ---------------- | -------------------------------------------------------------- |
| `currentProjectId`              | Orchestration    | It's "which project is loaded", not part of the project itself |
| `notes`, `tempo`, etc.          | SavedProject     | Actual project data                                            |
| `selectedNoteIds`, `audioPeaks` | Transient state  | Reset on load, not persisted                                   |

The project ID is the **storage key**, not stored **inside** the project data.

---

## Detailed Problem Analysis

1. **`saveProject`/`loadProject` in `project-store.ts` reach across layers**
   - They're in the Zustand store file but manipulate `project-list.ts` internals
   - Call `updateProjectMetadata()`, `setLastProjectId()` - metadata concerns

2. **These functions are only used in `app.tsx` init**
   - Not general-purpose store utilities
   - They're orchestration logic, not state management

3. **`project-store.ts` does too much**
   - Zustand state definition
   - localStorage serialization/deserialization
   - Project list metadata updates
   - Last project ID tracking

4. **Naming confusion between layers**
   - `createProject()` (project-list.ts) - only creates metadata entry
   - `loadProject()` (project-store.ts) - loads data AND updates metadata
   - They sound like peers but operate at different levels

## Current Architecture

```
app.tsx
   │
   ├── initMutation calls:
   │      loadProject(id)      ← project-store.ts
   │      createProject()      ← project-list.ts
   │
   └── subscribe callback calls:
          saveProject()        ← project-store.ts

project-store.ts
   ├── Zustand store definition
   ├── saveProject() → localStorage + project-list.ts
   └── loadProject() → localStorage + project-list.ts + Zustand

project-list.ts
   ├── Project metadata CRUD
   ├── Last project ID tracking
   └── Migration logic
```

### Data Flow Issues

```
saveProject():
  store.getState() → serialize → localStorage.setItem()
                               → updateProjectMetadata()  ← layer violation
                               → setLastProjectId()       ← layer violation

loadProject():
  localStorage.getItem() → deserialize → store.setState()
                                       → setLastProjectId()  ← layer violation
```

## Proposed Architecture

### Option A: Move orchestration to app.tsx

Since `saveProject`/`loadProject` are only used during init, move them to the orchestrator:

```
app.tsx (orchestrator)
   ├── initProject()
   │      ├── readProjectData(id)     ← pure localStorage read
   │      ├── store.setState(...)     ← Zustand
   │      └── setLastProjectId(id)    ← project-list.ts
   │
   └── setupAutoSave()
          subscribe → writeProjectData() + updateProjectMetadata()

lib/project-storage.ts (new)
   ├── readProjectData(id): ProjectData | null
   ├── writeProjectData(id, data): void
   └── serializeProject / deserializeProject

lib/project-list.ts (unchanged)
   ├── createProjectEntry(name?): string
   ├── deleteProjectEntry(id): void
   ├── listProjects(): ProjectMetadata[]
   ├── getLastProjectId(): string | null
   └── setLastProjectId(id): void

stores/project-store.ts (simplified)
   ├── Zustand store definition only
   └── Actions (addNote, updateNote, etc.)
```

### Option B: Create ProjectManager class

Consolidate all project operations into a single manager:

```typescript
// lib/project-manager.ts
class ProjectManager {
  // High-level operations (orchestration)
  create(name?: string): string {
    const id = createProjectEntry(name);
    useProjectStore.setState({ currentProjectId: id, ...DEFAULTS });
    return id;
  }

  load(id: string): void {
    const data = this.readFromStorage(id);
    useProjectStore.setState({ currentProjectId: id, ...data });
    setLastProjectId(id);
  }

  save(): void {
    const state = useProjectStore.getState();
    this.writeToStorage(state.currentProjectId, state);
    updateProjectMetadata(state.currentProjectId, { updatedAt: Date.now() });
  }

  // Low-level storage (private)
  private readFromStorage(id: string): ProjectData | null;
  private writeToStorage(id: string, data: ProjectData): void;
}

export const projectManager = new ProjectManager();
```

### Option C: Keep files, clarify naming

Minimal change - just rename to make layers obvious:

```typescript
// project-list.ts - metadata only
export function createProjectEntry(name?): string
export function deleteProjectEntry(id): void
export function getProjectEntry(id): ProjectMetadata | null
export function updateProjectEntry(id, updates): void
export function listProjectEntries(): ProjectMetadata[]

// project-store.ts - Zustand only, no persistence
// Remove saveProject, loadProject, hasSavedProject

// app.tsx - orchestration inline or extracted to project-init.ts
function initProject(id?: string) { ... }
function setupAutoSave() { ... }
```

## Recommendation

Start with the **pure serialization functions** approach above. This:

1. **Clarifies what is project data vs orchestration** - `toSavedProject`/`fromSavedProject` make it explicit
2. **Minimal change** - keep existing file structure, just add pure functions
3. **Enables further refactoring** - once serialization is pure, moving orchestration becomes easy
4. **Makes `currentProjectId` clearly separate** - it's set by orchestrator, not part of saved data

After this, the architecture becomes clearer and we can decide if further separation is needed.

## Implementation Steps

1. Add `SavedProject` interface (already exists, but review for correctness)
2. Add `toSavedProject(state): SavedProject` - pure function
3. Add `fromSavedProject(data): Partial<ProjectState>` - pure function
4. Update `saveProject()` to use `toSavedProject()`
5. Update `loadProject()` to use `fromSavedProject()` and set `currentProjectId` separately
6. Move `saveProject`/`loadProject` to `app.tsx` (or new `lib/project-init.ts`)
7. Remove them from `project-store.ts`

## Files Affected

- `src/app.tsx` - will contain orchestration logic
- `src/stores/project-store.ts` - remove persistence functions
- `src/lib/project-storage.ts` - new file for localStorage read/write
- `src/lib/project-list.ts` - possibly rename functions
- `e2e/persistence.spec.ts` - may need updates
- `e2e/multiple-projects.spec.ts` - may need updates

## Status

- [x] Problem identified
- [x] Options documented
- [x] Discuss approach
- [x] Add toSavedProject/fromSavedProject pure functions
- [ ] Move saveProject/loadProject to app.tsx (future)
- [ ] Documentation update

## Related

- `docs/2026-01-11-multiple-projects.md` - introduced multi-project support
- `docs/2026-01-12-app-initialization-architecture.md` - broader init refactor discussion
- `docs/architecture.md` - needs update after refactor
