# Opening a project = navigation

Follow-up to #152 / #158 (`/project/:id` route). #158 shipped the route as a
hidden side-door: nothing in the product produces such a URL. This change
makes it the product surface: all ways of opening a project become full-page
navigation to `/project/:id`, and `ProjectRoute` becomes the only way into
the editor.

Client-side (SPA) navigation stays out of scope — tracked in #161. Project
id format cleanup is #160.

## Changes

- `src/app.tsx`
  - `openProject(projectId)` helper: `location.href = "/project/" + id`.
  - `StartupApp`: delete `initMutation` entirely — project-card click and
    "New Project" (`projectStorage.createNew()` first) navigate; the Space
    handler navigates. The startup screen is now a pure list view; the
    audio-init-inside-gesture path is gone (unlock listener from #158
    covers it).
  - `ProjectListView`: `isLoading` prop dropped; import-pending state
    already lives inside the component.
  - Settings "Projects" button: `location.href = "/"` in the same tab,
    replacing the `window.open("/", "_blank")` TODO.
  - Unknown-id error screen gets a "Back to projects" link (was a dead
    end).
- `src/main.tsx`: `pagehide` listener calls `flushAutoSave()` — covers
  navigating away _and_ tab close (a pre-existing data-loss window, since
  auto-save is debounced).

`lastProjectId` demotes to powering the Continue button/highlight on `/`
(still written by `openProjectSession`).

## e2e

`page.reload()` semantics changed: the URL now names the project, so reload
re-enters the editor directly instead of landing on the startup screen.
Specs were updated by intent:

- persistence-style checks (`reload` + `clickContinue`) → `reload` +
  new `waitForEditor` helper — the reload itself is now the restore
- back-to-the-list reloads → `page.goto("/")`

Suite runs faster as a side effect (~1.7m → ~40s) since reload skips the
startup screen. Rewriting specs to seed + `goto("/project/<id>")` for setup
is a further cleanup, not done here.
