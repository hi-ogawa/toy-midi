# App Initialization & Project Management Architecture

## Problem

The current app initialization and project switching architecture has fundamental design issues that lead to hacky workarounds (like using URL hash to pass project IDs across page reloads).

## Current Architecture

### App Component Structure

```typescript
export function App() {
  const initMutation = useMutation({
    mutationFn: async (options: { restore: boolean; projectId?: string }) => {
      // Initialize audio manager
      // Load project (new or existing)
      // Setup audio assets
      // Setup subscriptions
      // Setup auto-save
    }
  });

  if (initMutation.isPending) {
    return <LoadingScreen />;
  }

  if (!initMutation.isSuccess) {
    return <ProjectListView />; // Startup screen
  }

  return <MainApp />; // Piano roll, transport, etc.
}
```

### Issues

1. **One-time initialization pattern**: `initMutation` can only run once per App mount. Once `isSuccess=true`, we're "stuck" in the main app view.

2. **Project switching requires full page reload**: To switch projects from the main app:
   - Can't call `initMutation.mutate()` again (already succeeded)
   - Must reload the entire page to reset state
   - Lose all React state, component trees, etc.

3. **Startup screen bypass hack**: After setting project ID and reloading:
   - App shows startup screen (`!initMutation.isSuccess`)
   - We use URL hash to auto-trigger `initMutation.mutate()` on mount
   - Feels like a workaround rather than intentional design

4. **State management split**:
   - Project data in Zustand store (`useProjectStore`)
   - App initialization state in React Query mutation
   - Navigation state in component state
   - No single source of truth for "which project is active"

5. **Audio manager lifecycle unclear**:
   - When should it be initialized?
   - When should it be torn down?
   - How does it survive project switches?

## Root Causes

### 1. Conflating "App Initialization" with "Project Loading"

The `initMutation` does two distinct things:

- One-time app setup (audio manager init, subscriptions)
- Project-specific loading (load project data, setup audio assets)

These should be separate concerns:

- App initialization: Once per page load
- Project loading: Can happen multiple times

### 2. Using Mutation for Navigation State

React Query mutations are designed for async operations with loading/error states, not for navigation/routing between views. We're abusing `initMutation.isSuccess` as a router state.

### 3. No Clear Project Lifecycle

When switching projects, what needs to happen?

- Save current project? (auto-save already handles this)
- Unload audio assets?
- Clear subscriptions?
- Reset viewport state?
- Load new project data?
- Load new audio assets?

Currently we just reload the page to "reset everything", which is a sledgehammer approach.

## Symptoms

- URL hash hack to pass project ID across reloads
- Can't switch projects without full page reload
- Code that's hard to reason about (mutation as router)
- Difficulty adding features like "switch project in modal"

## Potential Solutions

### Option A: Separate App Init from Project Loading

```typescript
export function App() {
  const [appInitialized, setAppInitialized] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // One-time app initialization
  useEffect(() => {
    audioManager.init().then(() => {
      setAppInitialized(true);
    });
  }, []);

  // Project loading (can happen multiple times)
  const loadProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      // Save current project (if any)
      if (currentProjectId) {
        saveProject();
      }
      // Load new project
      loadProject(projectId);
      // Load audio assets for new project
      // ...
      setCurrentProjectId(projectId);
    }
  });

  if (!appInitialized) {
    return <LoadingScreen />;
  }

  if (!currentProjectId) {
    return <ProjectListView onSelectProject={loadProjectMutation.mutate} />;
  }

  return (
    <MainApp
      projectId={currentProjectId}
      onSwitchProject={loadProjectMutation.mutate}
    />
  );
}
```

**Pros**:

- Clear separation of concerns
- Can switch projects without reload
- `loadProjectMutation` can be called multiple times
- Current project ID is explicit state

**Cons**:

- Need to carefully manage audio/subscription cleanup
- More complex state transitions
- Need to handle edge cases (what if load fails mid-switch?)

### Option B: Use React Router / URL-based Navigation

```typescript
<BrowserRouter>
  <Routes>
    <Route path="/" element={<ProjectListView />} />
    <Route path="/project/:projectId" element={<ProjectEditor />} />
  </Routes>
</BrowserRouter>
```

**Pros**:

- Proper routing/navigation semantics
- Browser back/forward work correctly
- URL reflects current state
- Each route has clear init/cleanup lifecycle

**Cons**:

- Adds dependency on React Router
- Need to manage audio manager across route changes
- More boilerplate

### Option C: Keep Current Architecture but Make it Explicit

Accept that project switching = page reload, but make it cleaner:

```typescript
// Project switching helper
function switchToProject(projectId: string) {
  // Save current state
  saveProject();
  // Set localStorage flag for next load
  localStorage.setItem("toy-midi-next-project", projectId);
  // Reload
  window.location.reload();
}

// On App mount
export function App() {
  const nextProjectId = localStorage.getItem("toy-midi-next-project");
  if (nextProjectId) {
    localStorage.removeItem("toy-midi-next-project");
    // Auto-load this project
  }
  // ... rest of current logic
}
```

**Pros**:

- Minimal changes to current architecture
- Page reload is explicit intention
- No URL hash hack

**Cons**:

- Still requires full page reload
- Still conflates initialization with navigation
- Doesn't address root issues

### Option D: Single-Project Mode (Simplify)

Most users probably work on one project at a time. Consider:

- Remove project switching from main app
- Only show project list on startup
- To switch projects, you reload (show startup screen)

**Pros**:

- Simplest possible architecture
- Removes complex state management
- Clear UX: "one project at a time"

**Cons**:

- Less convenient for multi-project workflows
- Doesn't align with the "Projects" button we added

## Questions to Answer

1. **How often do users switch projects?**
   - If rarely: Page reload is acceptable
   - If frequently: Need smooth in-app switching

2. **What is the proper lifecycle for audio manager?**
   - Lives for entire page session?
   - Reinitialized per project?
   - Can it handle project switches without reinit?

3. **What is our SPA philosophy?**
   - True SPA (no page reloads after initial load)?
   - Hybrid (startup → app, then reload to switch)?
   - Multi-page app disguised as SPA?

4. **Do we want browser history for project switches?**
   - Should back/forward navigate between projects?
   - Or is project switching a "modal" operation?

## Recommendation

For now, I recommend **Option C** (Keep Current Architecture but Make it Explicit) because:

1. **Minimal risk**: Smallest change to working code
2. **Clearer than current**: localStorage flag is more explicit than URL hash
3. **Buys time**: Lets us ship current features while planning bigger refactor
4. **Easy to change**: Can migrate to Option A or B later

For long-term (next iteration), I recommend **Option A** (Separate Concerns):

1. **More flexible**: Enables future features like "Save As", "Duplicate Project"
2. **Better architecture**: Clear separation of initialization vs. loading
3. **Better UX**: No jarring page reload when switching projects
4. **Aligns with SPA goals**: Everything happens client-side

## Implementation Plan (Option C - Short Term)

1. Remove URL hash hack
2. Add `switchToProject(projectId)` helper function
3. Use localStorage flag pattern
4. Update project modal to use helper
5. Document this as temporary solution
6. File issue for Option A refactor

## Implementation Plan (Option A - Long Term)

1. Extract audio manager lifecycle management
2. Create `useProjectLoader` hook
3. Separate `appInitialized` from `currentProjectId` state
4. Update subscriptions to handle project changes
5. Add cleanup logic for project switches
6. Test thoroughly (especially audio/subscription edge cases)

## Status

- [ ] Discuss approach with team/user
- [ ] Decide on short-term vs long-term solution
- [ ] Implement chosen approach
- [ ] Update tests
- [ ] Document architecture decision

## Related Files

- `src/app.tsx` - Main app component with initialization
- `src/stores/project-store.ts` - Project state management
- `src/lib/audio.ts` - Audio manager lifecycle
- `docs/2026-01-11-multiple-projects.md` - Multiple projects feature
- `docs/architecture.md` - Overall architecture (should be updated)
