# Multiple Project Support

## Problem

Currently, the app only supports a single project stored in localStorage under the key `toy-midi-project`. When users create a new project, the previous one is lost. This limits the ability to work on multiple transcription projects.

## Goal

Allow users to save and manage multiple projects, each with its own set of notes, settings, and audio reference.

## Approach

Extend the current persistence system to support multiple named projects:

1. **Storage Structure**:
   - `localStorage["toy-midi-project-list"]`: Array of project metadata `{ id, name, createdAt, updatedAt }`
   - `localStorage["toy-midi-last-project-id"]`: ID of last opened project
   - `localStorage["toy-midi-project-{id}"]`: Individual project data (same structure as current)
   - IndexedDB `assets` store: Shared across projects (as currently implemented)

2. **Startup Screen Enhancement**:
   - Show list of saved projects (name, updated date, note count)
   - "New Project" button
   - "Continue Last" quick action (pre-selected)
   - Click project card to open

3. **Project Management UI**:
   - Add "Save As..." to save current project with new name
   - Add "Project" menu/button in Transport header
   - Project list modal with rename/delete/duplicate actions
   - Auto-save current project (existing behavior)

## Reference Files

- `src/stores/project-store.ts` - Current persistence (single project)
- `src/app.tsx` - Startup flow and initialization
- `src/lib/asset-store.ts` - IndexedDB for audio (already shared-friendly)
- `e2e/persistence.spec.ts` - Existing persistence tests
- `docs/2026-01-08-project-persistence.md` - Original persistence design

## Implementation Steps

### Phase 1: Storage Layer

1. **Create project list management** (`src/lib/project-list.ts`)
   - `listProjects()` → `ProjectMetadata[]`
   - `createProject(name)` → `projectId`
   - `deleteProject(projectId)` → `void`
   - `getProjectMetadata(projectId)` → `ProjectMetadata | null`
   - `updateProjectMetadata(projectId, metadata)` → `void`

2. **Update project-store.ts**
   - Change `STORAGE_KEY` to function: `getProjectKey(projectId)`
   - Add `currentProjectId` to store state
   - Update `saveProject()` to save to specific project ID
   - Update `loadProject(projectId)` to load specific project
   - Add `saveProjectAs(name)` action

### Phase 2: Startup Screen with Project List

3. **Update startup screen** (`src/app.tsx`)
   - Show project list if projects exist
   - "New Project" flow: prompt for name
   - "Continue" flow: load last project ID
   - Click project card: load that project

4. **Add project selector component** (`src/components/project-list.tsx`)
   - Display projects in grid/list
   - Show metadata: name, date, note count
   - Click to select/open
   - Delete button (with confirmation)

### Phase 3: Project Management UI

5. **Add project menu to Transport** (`src/components/transport.tsx`)
   - "Save As..." button/menu item
   - "Manage Projects..." button (opens modal)

6. **Create project management modal** (`src/components/project-manager.tsx`)
   - List all projects
   - Rename, duplicate, delete actions
   - Show storage usage

### Phase 4: Testing

7. **E2E tests** (`e2e/multiple-projects.spec.ts`)
   - Create multiple projects
   - Switch between projects
   - Verify isolation (changes in one don't affect others)
   - Delete projects
   - Rename projects

## Minimal Implementation (MVP)

For minimal changes, focus on core functionality:

1. ✅ Project list storage (`src/lib/project-list.ts`)
2. ✅ Multi-project persistence in `project-store.ts`
3. ✅ Startup screen with project list (enhance existing)
4. ✅ Basic E2E tests for multiple projects
5. ⏭️ Skip advanced UI (rename, duplicate) for now - can be added later

## Data Migration

Need to migrate existing single project to new multi-project structure:

```typescript
// On first load with new version
if (
  localStorage.getItem("toy-midi-project") &&
  !localStorage.getItem("toy-midi-project-list")
) {
  // Migrate: create project list with single "Untitled" project
  const projectId = generateProjectId();
  const oldProject = localStorage.getItem("toy-midi-project");
  localStorage.setItem(`toy-midi-project-${projectId}`, oldProject);
  localStorage.setItem(
    "toy-midi-project-list",
    JSON.stringify([
      {
        id: projectId,
        name: "Untitled",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]),
  );
  localStorage.setItem("toy-midi-last-project-id", projectId);
  localStorage.removeItem("toy-midi-project"); // clean up
}
```

## Status

- [x] Task doc created
- [x] Implementation plan approved
- [x] Project list storage implementation
- [x] Multi-project persistence implementation
- [x] Startup screen enhancement
- [x] E2E tests (all 35 tests passing)
- [x] Data migration
- [x] Build verification
- [x] Documentation update

## Summary

The multiple project support feature has been successfully implemented with the following key changes:

1. **Storage Layer** (`src/lib/project-list.ts`):
   - Project list management functions
   - Unique project ID generation
   - Metadata tracking (name, createdAt, updatedAt)
   - Migration from old single-project storage

2. **State Management** (`src/stores/project-store.ts`):
   - Added `currentProjectId` to store state
   - Updated `saveProject()` to save to project-specific key
   - Updated `loadProject()` to accept optional project ID
   - Auto-update project metadata on save

3. **UI** (`src/app.tsx`):
   - Enhanced startup screen with project list
   - "Continue Last" button for quick resume
   - "New Project" button always available
   - Click project card to load specific project
   - Enter key shortcut for continuing last project

4. **Testing** (`e2e/multiple-projects.spec.ts`):
   - 6 new E2E tests covering:
     - Creating multiple projects
     - Project isolation
     - Continue last project
     - Migration from old storage
     - Project list ordering
     - Keyboard shortcuts
   - All 35 total E2E tests passing

5. **Backward Compatibility**:
   - Automatic migration from old `toy-midi-project` key
   - Migrated project named "Untitled"
   - No data loss during migration

The feature is complete and ready for use. Users can now work on multiple transcription projects simultaneously, with each project maintaining its own notes, settings, and audio references.
