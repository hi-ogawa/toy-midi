# Counterexamples Exploration

## Prompt

```text
Explore the toy-midi repository for concrete counterexamples to review-domain splitting: files/functions where unrelated correctness arguments, lifecycle protocols, platform mechanics, and product policy are interleaved enough to burden linear human review. Avoid superficial 'large file' criticism. Identify 4-6 actionable examples with exact file paths and line ranges, name each mixed review domain, explain why a logical boundary would help, and suggest the narrowest boundary (including in-file helper where appropriate). Rank by confidence and impact. Do not edit files. Thoroughness: very thorough.
```

## Response

## Ranked findings

### 1. Piano-roll drag handling mixes pointer lifecycle, musical transforms, history transactions, and audio preview

**Path and ranges**

- `/home/hiroshi/code/personal/toy-midi/src/components/piano-roll.tsx:461-640`
- `/home/hiroshi/code/personal/toy-midi/src/components/piano-roll.tsx:642-900`
- Related global protocol: `/home/hiroshi/code/personal/toy-midi/src/lib/history-store.ts:52-65,86-91`

**Confidence:** Very high  
**Impact:** High

**Mixed review domains**

1. Browser pointer lifecycle and coordinate conversion
2. Note-selection and duplication product semantics
3. Grid snapping, pitch clamping, and multi-note movement correctness
4. Undo transaction protocol
5. Immediate synthesizer preview lifecycle
6. Zustand mutation sequencing

`handleGridMouseDown`, `handleMouseMove`, and `handleMouseUp` collectively implement a state machine, but its transactional rules are scattered through event branches. A reviewer must mentally pair every `historyStore.startDrag()` with a later `endDrag()`, verify that intermediate `updateNote()` calls are suppressed from history, reconstruct original note snapshots, and separately validate snapping and selection behavior.

There are concrete warning signs:

- Duplicate creation calls `addNote()` at lines 538-545 before `startDrag()` at line 559. Each duplicate can therefore create an individual history entry, followed by an additional batch `add-notes` entry at lines 801-815.
- History cleanup depends on receiving the window `mouseup` path at lines 908-913. There is no explicit cancellation path for unmount, lost focus, or an interrupted gesture, so the global `isInDrag` protocol can be left active.
- Audio preview cleanup is another parallel lifecycle that must terminate alongside the history transaction.

**Narrowest boundary**

Keep it in this file initially, but introduce a `useNoteDragTransaction` helper or small controller with:

- `begin(intent)`
- `update(pointer)`
- `commit()`
- `cancel()`

Move snapping and proposed note updates into a pure `calculateDragUpdate` helper. The transaction should apply history-suppressed preview mutations and commit exactly one batch store command. It should also own preview-note cleanup and unmount cancellation. This is narrower than splitting rendering components and directly isolates the difficult correctness protocol.

---

### 2. Project archive parsing performs compatibility validation and persistent writes in the same pass

**Path and range**

- `/home/hiroshi/code/personal/toy-midi/src/lib/project-file.ts:123-212`

**Confidence:** Very high  
**Impact:** High

**Mixed review domains**

1. Untrusted ZIP and JSON parsing
2. Archive-format compatibility policy
3. Cross-file referential integrity
4. Saved-project schema migration
5. MIME/File reconstruction
6. IndexedDB persistence and asset-key rewriting

`parseProjectFile()` sounds like parsing, but it also commits imported assets through `projectStorage.saveAsset()` at lines 166-168 and 201-203. In the v2 loop, each asset is persisted before later manifest entries have been validated. If a subsequent entry references a missing track or ZIP member, the function throws after earlier assets have already been written. Because assets currently have no garbage collection, failed imports can leave durable orphans.

The reviewer must therefore prove both archive validity and partial-failure behavior while following version-specific branches and mutation of `project.audioTracks`.

**Narrowest boundary**

Split this function into two phases in the same module:

1. `readProjectArchive(file): Promise<ValidatedProjectArchive>` performs all version checks, track/path matching, ZIP-member existence checks, migration, and blob extraction without storage writes.
2. `persistImportedProjectAssets(validated)` saves assets and returns the rewritten `SavedProject`.

At minimum, validate every manifest reference before the first `saveAsset`. This makes archive correctness independently reviewable and creates an explicit commit boundary.

---

### 3. Audio-track UI orchestration hides cross-project asset-retention policy and partial-import behavior

**Path and range**

- `/home/hiroshi/code/personal/toy-midi/src/components/settings.tsx:127-169`
- A second deletion path exists at `/home/hiroshi/code/personal/toy-midi/src/components/piano-roll.tsx:309-318`
- Shared-asset contract: `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:1-5,239-241`

**Confidence:** Very high  
**Impact:** High

**Mixed review domains**

1. ZIP expansion and browser audio decoding
2. IndexedDB asset identity and retention
3. Tone.js runtime graph ordering
4. Project-store insertion/removal
5. Multi-file import product semantics
6. UI mutation and error reporting

The import mutation decodes, persists, attaches a runtime buffer, and adds each track sequentially. If file three of a ZIP fails, files one and two remain imported while the overall mutation reports failure. Reviewing whether that partial success is intended requires following four subsystems.

The removal path exposes a more serious ownership mismatch. `handleRemoveAudio()` deletes the IndexedDB asset before deleting the track. However, storage keys are derived from source-file identity, and the storage contract explicitly says assets can be shared across projects. Removing one track can therefore make another project’s reference unreadable. The keyboard deletion path duplicates the same policy.

**Narrowest boundary**

Create one library-level track-asset operation used by both deletion call sites:

- `removeAudioTrackReference(trackId)` should remove the project reference but retain the shared asset by default.
- Any physical deletion should be a storage-owned garbage-collection operation that proves no persisted project references the key.

For import, an `importAudioTracks(input)` helper should stage decoded tracks first and then commit them as a batch, or return an explicit per-file result if partial import is intentional. The React mutation should own only pending/error presentation.

---

### 4. Active-project setup interleaves several independent lifecycle protocols in one function

**Path and range**

- `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:46-130`
- Restoration reconciliation: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:133-188`
- Global autosave handle: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:190-196`

**Confidence:** High  
**Impact:** Medium-high

**Mixed review domains**

1. Synchronous document hydration
2. Audio-graph synchronization subscription
3. Debounced persistence and final flush
4. Global keyboard-shortcut policy
5. Abortable asynchronous audio initialization
6. Stored-asset restoration and user-facing failure policy
7. Session disposal and history cleanup

`openProjectSession()` is not merely an orchestrator with simple calls. It defines the autosave transaction, owns an `AbortController`, installs browser listeners, starts asynchronous initialization, reconciles fresh state after readiness, and establishes cleanup ordering. A reviewer checking “no store writes after disposal” must read through restoration, while a reviewer checking “pending edits flush exactly once” must reason about subscription teardown, `flush()`, and the module-global `activeSaveDebouncer`.

Restoration also combines parallel effect-free loading with sequential product decisions: failed assets keep a dead track with error state, missing assets delete the track, and successful assets attach playback and update waveform state.

**Narrowest boundary**

Extract small in-file lifecycle installers:

- `installAutosave({ projectId }) -> { flush, dispose }`
- `installPlaybackShortcut({ signal })`
- `attachSessionAudio({ signal })`
- `reconcileRestoredTracks(outcomes)`

Keep `openProjectSession()` as the owner of ordering, but make each returned disposer explicit. This allows separate review of debounce/flush correctness, listener lifetime, abort behavior, and missing-asset policy without introducing a broader abstraction.

---

### 5. Audio state synchronization mixes mixer policy with Tone.js mechanics and incremental-update optimization

**Path and ranges**

- `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:137-173`
- `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:226-258`

**Confidence:** High  
**Impact:** Medium-high

**Mixed review domains**

1. Product mute/solo policy across MIDI and audio tracks
2. Project-state diffing by object identity
3. Performance policy deciding which graph operations are expensive
4. Tone.js parameter mutation
5. Runtime player creation, synchronization, and disposal

`applyState()` computes global solo semantics while directly mutating Tone channels and deciding whether state identity changes warrant rebuilding MIDI events or reconciling players. `syncAudioTracks()` then combines collection reconciliation, resource disposal, volume/mute policy, and transport resynchronization.

This burdens review because a policy change such as solo behavior must be checked against both MIDI and audio branches, while a performance change to diff conditions can silently prevent that policy from reaching the graph. Resource-lifecycle review is also mixed into the same loop that computes audible state.

**Narrowest boundary**

Add a pure in-file derivation:

```ts
deriveAudioGraphState(projectState);
```

It should return resolved MIDI mute, per-track effective mute, volumes, tempo, metronome configuration, and program. `applyState()` can diff this resolved representation and issue Tone operations. Keep `AudioTrackPlayback` as the mechanics boundary, but move map reconciliation into a helper that receives already-resolved track settings.

This is preferable to splitting `audio.ts` merely by class size because it separates policy proof from platform-side-effect proof.

---

### 6. Score runtime combines third-party engraving geometry, transport time, DOM overlays, and auto-scroll policy

**Path and ranges**

- Load/reconciliation: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:219-256`
- Cursor interpolation and scrolling: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:322-371`
- OSMD geometry extraction: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:438-597`

**Confidence:** High  
**Impact:** Medium

**Mixed review domains**

1. OpenSheetMusicDisplay lifecycle and internal graphical model
2. MusicXML tempo/time-signature interpretation
3. Musical-time to wall-clock conversion
4. Page-local to shared DOM coordinate conversion
5. Cursor interpolation across wrapped systems
6. Click-target DOM construction
7. Manual-scroll suppression and viewport-following product policy

`load()` clears and renders OSMD, applies engraving settings, computes geometry, parses score metadata, reconciles the existing clock, publishes external-store state, and positions the cursor. `#updateCursor()` then handles musical interpolation, wrapped-system behavior, transformed coordinates, and auto-scroll containment in one method. The geometry builders depend on OSMD internals and manually constructed DOM page offsets.

A reviewer changing paged rendering must simultaneously understand clock state and scroll policy, while a reviewer changing playback interpolation must trust detailed OSMD coordinate assumptions. Those arguments are related operationally but not logically.

**Narrowest boundary**

Introduce an in-file `OsmdScoreGeometry` adapter, or a small dedicated module if tests warrant it. It should own:

- Cursor-anchor extraction
- Page-coordinate conversion
- Measure target specifications

Prefer returning geometry data rather than creating DOM elements directly. The runtime should retain clock reconciliation, cursor interpolation, and scrolling. A separate pure `resolveCursorFrame(positions, scoreTime)` helper would further isolate interpolation and wrapped-system rules without fragmenting the class.

## Overall assessment

The strongest counterexamples are not simply the largest files. They are locations where a single event or operation crosses an implicit commit boundary:

- A drag crosses pointer, history, store, and audio lifecycles.
- Archive parsing crosses validation and durable persistence.
- Track removal crosses local UI intent and shared-asset ownership.
- Session opening crosses several independently disposable protocols.

Those boundaries deserve priority because they reduce the amount of global state and failure behavior a reviewer must simulate linearly. No files were edited.
