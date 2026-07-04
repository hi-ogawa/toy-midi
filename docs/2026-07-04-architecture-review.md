# Architecture Review & Improvement Plan

**Date:** 2026-07-04
**Status:** Planning
**Scope:** Full-codebase architectural review. Each workstream below is independently implementable; a fresh agent should be able to pick up any single workstream from this doc alone.

## Background

The architecture is layered as: components → Zustand store (`src/stores/project-store.ts`) → subscription (`src/app.tsx:73`) → `AudioManager.applyState()` (`src/lib/audio.ts:263`) → Tone.js. Playback state (isPlaying/position) is owned by Tone.js Transport and read reactively via `src/hooks/use-transport.ts`. Persistence is pure serialize/deserialize (`toSavedProject`/`fromSavedProject`) + `src/lib/project-manager.ts` (localStorage) + `src/lib/asset-store.ts` (IndexedDB blobs).

The pattern itself is right. The problems below are mostly places where **non-document state (drag previews, viewport, audio buffers) is routed through the document-state pipe, or where sync escapes the pipe entirely.**

Prior related docs:

- docs/2026-01-11-state-management-principles.md (the intended sync pattern)
- docs/2026-01-11-unified-state-audio.md (alternative merged-store idea — superseded by this plan)
- docs/2026-01-12-app-initialization-architecture.md (init/project-switching refactor; Option A endorsed here)
- docs/2026-01-13-reduce-rerender-blast-radius.md (overlaps WS2)

## Priority order

1. **WS1** — commit-on-mouseup drags (perf + deletes history hacks; unlocks WS6)
2. **WS4** — audioAssetKey in applyState (fixes a live bug)
3. **WS2 + WS3** — selector subscriptions + document/view/ephemeral slices
4. **WS8** — app init / project session (already-planned refactor, add dispose ownership)
5. **WS5, WS6, WS7, WS9** — independent follow-ups

---

## WS1: Commit-on-mouseup drag interactions (highest priority)

### Problem

During a note drag, every `mousemove` calls `updateNote` per selected note (`src/components/piano-roll.tsx:749-806`). Each call:

- is a separate store update (N updates per mousemove for N selected notes — `updateNotes` batch action exists but is unused here)
- fires the `applyState` subscription; `state.notes !== prevState.notes` → `AudioManager.setNotes()` clears and rebuilds the **entire** `Tone.Part` (`src/lib/audio.ts:319-334`). 10 selected notes = 10 full Part rebuilds per mousemove.
- resets the autosave debounce timer (`src/app.tsx:83-96`) continuously.

This forced workarounds: `historyStore.isInDrag` flag suppresses history during drag (`src/stores/history-store.ts:46-49`), and mouseup reconstructs a history entry by diffing `originalStates` captured at mousedown (`src/components/piano-roll.tsx:864-953`).

### Approach

Introduce **preview state**: in-progress drags render from local `dragMode` deltas only; the store is written **once** on mouseup.

- Extend `DragMode` variants (`piano-roll.tsx:185-234`) to carry current delta (they mostly already do: `startBeat`/`startPitch` vs original states).
- `NoteDiv` rendering: for notes participating in the drag, apply the delta at render time instead of reading mutated store values. `visibleNotes` mapping is the natural place.
- `handleMouseMove`: only `setDragMode(...)`, no `updateNote` calls. Keep `previewNote()` audio feedback on pitch change.
- `handleMouseUp`: apply final positions via a single `updateNotes` batch (moving/resizing) or `addNotes`-style commit (duplicating). History is then recorded naturally by the store action.
- Delete: `historyStore.startDrag/endDrag/isInDrag`, and all manual `pushOperation` calls in `handleMouseUp`.
- "duplicating" mode currently creates real notes at mousedown (`piano-roll.tsx:612-661`); change to render phantom duplicates from dragMode and create notes only on mouseup.

### Notes

- This supersedes the "TODO: incremental add / remove" in `AudioManager.setNotes` — one rebuild per committed edit is fine.
- E2E tests that assert intermediate drag state may need updating (`e2e/piano-roll.spec.ts`). PRD backlog item "E2E test for resize batching" becomes trivial after this.
- Also fixes: editing notes during playback currently retriggers a full Part rebuild per mousemove tick.

---

## WS2: Selector-based store subscriptions

### Problem

All four store consumers subscribe to the **whole store** with no selector: `src/components/piano-roll.tsx:295`, `src/components/transport.tsx:221`, `src/components/mixer.tsx:33`, `src/components/settings.tsx:59`. Zustand v5 no-selector = re-render on any state change. Combined with `useTransport()` updating `position` at 60fps, the whole PianoRoll (grid CSS regeneration, `visibleNotes` filter, all NoteDivs) re-renders every frame during playback.

### Approach

- Replace bare `useProjectStore()` with grouped selectors via `useShallow` (or several narrow hooks). Actions can come from a stable `useProjectStore.getState()`-style accessor or a dedicated actions selector (actions are stable references in Zustand).
- Isolate 60fps consumers: only the playhead line and auto-scroll need per-frame `position`.
  - Extract `<Playhead />` as its own component that alone calls `useTransport()` for position; or update a ref/CSS transform outside React.
  - Auto-scroll effect (`piano-roll.tsx:334-356`) can live in a tiny headless component.
  - `useTransport` TODO comment already sketches this: selector support à la `useTransport(s => s.isPlaying)` (use `useSyncExternalStore` with selector).
- React Compiler (PRD backlog) helps downstream memoization but does NOT fix no-selector store subscriptions — do this regardless.

---

## WS3: Document / view / ephemeral state slices

### Problem

One flat store mixes three lifecycles:

- **document** (undoable, persisted, audio-relevant): notes, tempo, timeSignature, locators, audioOffset, audio file refs, mixer settings
- **view** (persisted per project, not audio-relevant): scrollX/scrollY, pixelsPerBeat/Key, waveformHeight, gridSnap, autoScrollEnabled
- **ephemeral** (neither): selectedNoteIds, selectedLocatorId, isAudioTrackSelected, clipboard, showDebug, audioView

Consequences: wheel-scroll ticks fire `applyState` → `rampTo` on 3 volume signals + `bpm.value` assignment every tick (`src/lib/audio.ts:265-271` run unconditionally); selection changes reset the autosave timer and cause a full project serialization.

### Approach

Keep one store (avoid cross-store sync), but make subscriber trigger sets explicit:

- Add `subscribeWithSelector` middleware to `useProjectStore`.
- Audio sync subscribes to the document slice only. Bonus: make the "cheap" fields in `applyState` also diff against prevState (volumes, mute, bpm) — no more unconditional rampTo.
- Autosave subscribes to document + view slices (selection/clipboard changes shouldn't reset the timer).
- Optionally reorganize `ProjectState` interface by slice with comments; actual nesting is not required.

---

## WS4: Audio buffer lifecycle into applyState (live bug)

### Problem

Buffer load/unload escapes the sync pattern; it's imperative in 3 places: `src/app.tsx:56-70` (init restore), transport file-load flow, `src/components/settings.tsx:119-124` (remove audio: calls both `deleteAsset` + `audioManager.clearAudioBuffer()` + `clearAudioFile()`).

**Bug:** Delete key on selected audio track calls only the store action `clearAudioFile()` (`src/components/piano-roll.tsx:426`); nothing clears the player buffer because `applyState` doesn't watch `audioAssetKey`. The removed track keeps playing.

### Approach

Handle `audioAssetKey` transitions inside `applyState`:

- `key → null`: call `this.clearAudioBuffer()`.
- `key changed`: load asset (async: `loadAsset(key)` → `loadAudioFile` → set `player.buffer`, `syncAudioTrack(state.audioOffset)`, and push `audioView` back to store via its setter — this is the one acceptable store-write from AudioManager, or keep audioView computation in the caller and only buffer-set here; decide during implementation).
- Guard async races: track a "current load token" so a stale load doesn't overwrite a newer one.
- Then simplify: settings.tsx no longer calls `clearAudioBuffer()` directly; app.tsx init restore may collapse into the same path.
- E2E: add test — load audio, select audio track, press Delete, assert playback of audio stops / player has no buffer (`window.__store` helper + expose what's needed).

---

## WS5: Undo/redo simplification (snapshot-based)

### Problem

History is split: pushes inside store actions, inverse-application as per-entry-type branching in `src/stores/project-store.ts:362-451`, drag bypass via flags in `src/stores/history-store.ts`. Locators, audioOffset, audio removal have **no** undo (PRD TODOs).

### Approach

Replace the operation log with document-slice snapshots:

- Entry = `{ notes, locators, audioOffset }` (whatever the undoable document slice is; selection intentionally excluded, or included for nicer UX — decide).
- Push snapshot before each committed mutation; undo/redo = swap current state with stack top. Cap at 50 (existing `MAX_HISTORY`).
- Memory is fine at this scale (hundreds of notes × 50 entries).
- Deletes: all `HistoryEntry` types, per-type undo/redo branching (~200 lines), `isUndoing/isRedoing` flags (a snapshot restore is just `set()` without a push — make push explicit at mutation sites rather than implicit in actions, or add a `withHistory(fn)` wrapper).
- WS1 must land first (otherwise drag would push a snapshot per mousemove).
- Makes every future document field undoable for free (locators, audio ops — closes PRD TODOs).
- E2E: existing undo-redo.spec.ts should pass unchanged; add locator-undo test.

---

## WS6: Extract viewport math + drag reducer from piano-roll.tsx

### Problem

`piano-roll.tsx` is 2063 lines. Subcomponents coexisting in-file is fine (repo convention), but interaction logic is closures over component state — the highest-priority test target (AGENTS.md: editor interactions) is only E2E-testable.

### Approach

- `src/lib/viewport.ts`: pure `screenToGrid`, `gridToScreen`, visible-range computation, zoom-around-point math (currently inline in wheel handler `piano-roll.tsx:475-536`). Unit-test with vitest.
- Drag state machine as pure reducer: `(dragMode, event: {kind: down|move|up, beat, pitch, modifiers, hitTarget}) → { dragMode, commit? }` where `commit` describes the store mutation to apply on mouseup. Component becomes a thin adapter: DOM event → grid event → reducer → setDragMode / dispatch commit.
- Hit-testing (note body vs edge, `piano-roll.tsx:564-599`) also extractable pure given note list + coords + thresholds.
- Do after/with WS1 (commit-on-mouseup shapes the reducer's `commit` output).
- Converts many slow E2E scenarios into fast unit tests; keep a smaller E2E smoke set (aligns with PRD chore "consolidate E2E tests into user flows").

---

## WS7: Persistence hardening

### 7a. Validate at the boundary

`loadProjectData` (`src/lib/project-manager.ts:130`) is `JSON.parse(...) as SavedProject` — no validation. `.toymidi` import (`src/lib/project-file.ts`) is untrusted input by definition. Add schema validation (zod, or hand-rolled guards) in `fromSavedProject` / `parseProjectFile`. `version` field exists but has no migration mechanism — a `migrate(data): SavedProject` chain keyed by version is enough.

### 7b. IndexedDB asset leak on project delete

`deleteProject` (`src/lib/project-manager.ts:96`) removes localStorage keys but never deletes the audio blob. **Caveat:** asset keys are content-derived (`name-size-lastModified`, `src/lib/asset-store.ts:44`), so blobs are implicitly shared across projects — naive delete-on-project-delete would break another project referencing the same file.

Recommended: **GC sweep on startup** — list all projects' `audioAssetKey`s, enumerate IndexedDB keys, delete unreferenced. `project-manager` is the natural owner. (Alternative: per-project asset keys; simpler but duplicates storage.)

### 7c. (Optional) Move project data localStorage → IndexedDB

~5MB origin quota shared across all projects; IDB already set up. All reads/writes go through `project-manager`, so the change is contained. Makes save path async — autosave already tolerates that.

---

## WS8: App init / project session (extends existing plan)

docs/2026-01-12-app-initialization-architecture.md Option A is endorsed. One addition from this review:

The two subscriptions created inside `initMutation` (`src/app.tsx:73-96`: applyState sync + autosave) are **never unsubscribed**. Currently harmless because init runs once per page load, but it's exactly what bites when in-app project switching lands (double applyState, autosave writing to the wrong projectId captured in closure).

- Wrap project loading in a session object: `openProject(projectId) → { dispose() }` owning store hydration, asset load, both subscriptions (Zustand `subscribe` returns unsubscribe — capture it), and the save-timer cleanup.
- Project switch = `session.dispose(); session = openProject(next)`.
- AudioManager `init()` stays app-lifetime; buffer state transitions handled by WS4.

---

## WS9: Small items

- **Note/locator ID generation**: module-level counters restored by regex-parsing persisted IDs (`src/stores/project-store.ts:118-126, 613-625`) — fragile, cross-tab collision risk. Use `crypto.randomUUID()` (already used for project IDs); delete counter-restore logic. Check nothing depends on the `note-N` format (E2E helpers? grep first).
- **docs/architecture.md**: self-declared stale, describes a structure that no longer exists. Either regenerate, or cut down to layer diagram + pattern rules + links to task docs.
- `updateNote` multi-note loops in drag handlers should use `updateNotes` batch — moot after WS1.

---

## Validation

Per workstream: `pnpm lint`, `pnpm test`, `pnpm test-e2e`. WS1/WS4/WS5 need manual audio verification (drag notes during playback; delete audio track during playback; undo across locator/audio ops).
