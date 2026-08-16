# Positive Examples Exploration

This historical exploration predates the broader reasoning-boundaries framing, so it uses review-domain terminology throughout.

## Prompt

```text
Explore the toy-midi repository for concrete existing examples that embody review-domain splitting well. Focus on boundaries where product policy remains visible while mechanical/protocol/lifecycle details are isolated, including same-file helpers as well as modules. Read enough surrounding code to explain the distinct correctness arguments. Return 4-6 strongest examples with exact file paths and line ranges, what each review domain is, why the boundary helps linear human review, and any caveats. Do not edit files. Thoroughness: very thorough.
```

## Response

## Strongest examples

### 1. MusicXML export separates musical policy, notation decomposition, and XML protocol

**Key boundaries**

- Musical product policy: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/model.ts:69-160`
- Input preparation and rejection rules: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/model.ts:162-209`
- Key, locator, and measure assignment: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/model.ts:211-338`
- Mechanical duration splitting and tie construction: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/split-notation.ts:59-135`
- Notation-path algorithm: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/split-notation.ts:186-318`
- MusicXML document mapping: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/render.ts:28-130`
- Staff and event encoding: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/render.ts:132-266`
- Format-agnostic XML mechanics: `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/vdom.ts:1-62`

**Review domains and correctness arguments**

1. `model.ts` answers product and musical questions: what input is exportable, whether leading measures are trimmed, how locators and key changes behave, how TAB positions are chosen, and when polyphony must be rejected.
2. `split-notation.ts` answers an engraving algorithm question: can each occupied or silent span be represented by supported written durations, where should it split, and where must ties and tuplet boundaries appear?
3. `render.ts` answers the MusicXML interoperability question: are both staves emitted correctly, are cursor backups and voices valid, and are ties represented in both playback and engraving forms?
4. `vdom.ts` answers a generic serialization question: are attributes and text escaped, omitted nodes suppressed, and indentation structurally correct?

**Why this helps linear review**

A reviewer can follow one transformation at a time:

`project values → score model → notatable events → MusicXML tree → escaped XML`

The important policy remains concentrated near `buildMusicXmlModel`, particularly its validation, trimming, key-signature, and measure-building flow. The dynamic-programming details do not interrupt that flow, and XML escaping does not interrupt MusicXML semantics.

The test organization follows the same split. Musical cases are extensively characterized in `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/model.test.ts:37-750`, while the synchronized-staff serialization is checked separately in `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/render.test.ts:35-36`.

**Caveats**

- `toWrittenBassPitch` is duplicated in `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/model.ts:363-366` and `/home/hiroshi/code/personal/toy-midi/src/lib/musicxml/render.ts:268-271`, so those two review domains could drift.
- `model.ts` and `split-notation.ts` reference one another, although the reverse reference is type-only.
- `split-notation.ts` contains both event construction and a fairly involved optimization algorithm. That is cohesive, but it is still a substantial review domain by itself.

---

### 2. Active-project policy is visible in one orchestration path, while restoration mechanics are phased behind helpers

**Key boundaries**

- Route-level product behavior: `/home/hiroshi/code/personal/toy-midi/src/app.tsx:51-80`
- Open-once/Strict Mode boundary: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:26-39`
- Session orchestration and lifecycle: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:41-130`
- Parallel loading followed by sequential reconciliation: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:133-178`
- Effect-free asset loading helper: `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:180-188`
- Persistence facade used by the session: `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:73-231`

**Review domains and correctness arguments**

1. `ProjectRoute` makes the product promise explicit: deep links paint hydrated notes immediately, while playback becomes available later.
2. `openProjectSession` owns the active-document lifecycle in reading order: validate metadata, mark the project active, hydrate, subscribe audio, subscribe autosave, install shortcuts, attach audio in the background, then return symmetric cleanup.
3. `restoreAudioTracks` owns concurrency and reconciliation correctness. Reads and decoding fan out concurrently, but mutations and user-facing errors occur only after one abort barrier and in a deterministic sequential pass.
4. `loadStoredTrackAudio` is deliberately free of store mutation and user-facing effects, so its failure and concurrency behavior can be reviewed separately.

**Why this helps linear review**

The main function reads almost like a lifecycle checklist. A reviewer can verify that every installed resource has cleanup and that editing remains available during audio initialization without stepping through IndexedDB or decoding details. Then the restoration helper can be reviewed under a different argument: no mutation before the abort check, one failed asset does not poison other tracks, and missing versus failed assets have different product outcomes.

This is also a particularly good same-file split. The helper boundary documents not merely code reuse, but which phase is allowed to perform effects.

**Caveats**

- The session cache intentionally lives for the page lifetime, as stated at lines 26-30. It is not a general same-page close/reopen session manager.
- Aborting prevents later store reconciliation, but it does not cancel an IndexedDB read or decode already in progress.
- `activeSaveDebouncer` at `/home/hiroshi/code/personal/toy-midi/src/lib/project-session.ts:190-196` assumes one active session.
- Cleanup detaches session subscriptions but does not dispose or reset the global audio manager. Full-page project navigation makes that acceptable under the current routing policy.

---

### 3. Audio synchronization exposes mixer policy while isolating Tone.js resource and update mechanics

**Key boundaries**

- Audio lifecycle contract: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:14-44`
- Tone graph initialization: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:65-130`
- Product-state-to-audio policy: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:132-173`
- Track-map reconciliation: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:216-258`
- External playback-state store: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:334-424`
- Per-track Tone resource lifecycle: `/home/hiroshi/code/personal/toy-midi/src/lib/audio.ts:426-464`
- React adapter: `/home/hiroshi/code/personal/toy-midi/src/hooks/use-audio.ts:1-15`

**Review domains and correctness arguments**

1. `applyState` contains visible product policy: master and track settings are authoritative in project state, soloing changes effective mute state, cheap settings apply every time, and expensive note/player rebuilds depend on reference changes.
2. `syncAudioTracks` owns identity-based reconciliation: removed tracks are disposed, current tracks are created or updated, and players resynchronize only when an offset changes.
3. `AudioTrackPlayback` owns Tone-specific lifecycle symmetry: construct and connect, attach and synchronize, then stop, unsynchronize, and dispose.
4. `AudioStateStore` owns transport observation and high-frequency RAF updates without polluting persisted project state.
5. `useAudio` reduces React integration to the external-store contract and leaves transport mechanics outside components.

**Why this helps linear review**

The core policy in `applyState` fits into roughly forty lines and can be checked directly against mixer behavior. A reviewer does not need to interleave that reasoning with channel construction, player disposal, Tone event ordering, or React render frequency. The subordinate domains each have a focused invariant:

- reconciliation preserves one player per track ID;
- resource cleanup mirrors creation;
- snapshots change only when observable state changes;
- React selectors read stable external snapshots.

**Caveats**

- These domains are classes within one 513-line file rather than separate modules, so navigation remains heavier than the conceptual split.
- `AudioManager` exposes several low-level methods publicly, which means the “components update the project store” rule is conventional rather than enforced by the type boundary.
- The global manager and transport event subscriptions have no whole-manager disposal path. That matches the application-lifetime singleton design but narrows reuse.

---

### 4. Audio-to-MIDI keeps user-visible commit policy above model, worker, and RPC protocols

**Key boundaries**

- Bass conversion product policy: `/home/hiroshi/code/personal/toy-midi/src/components/audio-to-midi.tsx:71-145`
- Basic Pitch staged commit policy: `/home/hiroshi/code/personal/toy-midi/src/components/audio-to-midi.tsx:217-315`
- Basic Pitch client and analysis-cache policy: `/home/hiroshi/code/personal/toy-midi/src/lib/basic-pitch/client.ts:7-72`
- Worker-side model and cache semantics: `/home/hiroshi/code/personal/toy-midi/src/lib/basic-pitch/worker.ts:82-189`
- Bass WASM wire contract: `/home/hiroshi/code/personal/toy-midi/src/lib/bass-pitch/transcription.ts:1-62`
- Generic RPC serialization and typed proxy: `/home/hiroshi/code/personal/toy-midi/src/lib/rpc/core.ts:1-98`
- Worker request, callback, error, cleanup, and transfer protocol: `/home/hiroshi/code/personal/toy-midi/src/lib/rpc/worker.ts:4-162`

**Review domains and correctness arguments**

1. The component owns product decisions: which method is selected, whether Basic Pitch analysis is explicit, how source-relative seconds become project beats, whether output is quantized, how confidence becomes MIDI velocity, and that conversion replaces notes as exactly one undoable operation.
2. The client owns execution policy: Basic Pitch analysis is cached by asset, initialization verifies the requested backend, and decoding is separated because it is cheaper but still deliberate.
3. The worker owns model correctness: initialization is idempotent, cached activations correspond to the requested key, mutating upstream decoder inputs are copied, and model outputs are normalized into an application-neutral result.
4. The RPC modules own transport mechanics: callback stubs, request correlation, listener cleanup, error propagation, and transferable discovery.

**Why this helps linear review**

A product reviewer can inspect the conversion mutation and see the complete user-facing effect without reading `postMessage` handling or TensorFlow workarounds. A model reviewer can inspect caching and decoder mutation behavior without considering React state. A protocol reviewer can validate correlation and cleanup once for both Basic Pitch and Bass Pitch.

The split is confirmed by end-to-end tests phrased in product terms: one replacement/undo step at `/home/hiroshi/code/personal/toy-midi/e2e/audio-to-midi.spec.ts:19` and one-step grid-aligned Bass Pitch conversion at line 137.

**Caveats**

- Cancellation is not represented in the RPC contract.
- The Basic Pitch worker explicitly documents the absence of an application watchdog at `/home/hiroshi/code/personal/toy-midi/src/lib/basic-pitch/worker.ts:71-74`, so a stalled backend can leave the UI pending indefinitely.
- Conversion-to-project-note mapping remains inside the React component. It is highly visible there, but it is not independently unit-testable as a pure function.
- Each RPC request installs temporary worker listeners. Cleanup is clear for normal response and worker errors, but not for abandonment by the caller.

---

### 5. Persistence separates document compatibility, storage-layout durability, and IndexedDB mechanics

**Key boundaries**

- Storage-tier policy and concurrency assumptions: `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:33-47`
- Project-facing storage facade: `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:73-231`
- Copy-before-delete layout migration: `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:243-291`
- Generic IndexedDB transaction wrapper: `/home/hiroshi/code/personal/toy-midi/src/lib/idb.ts:1-68`
- Saved document contract and defaults: `/home/hiroshi/code/personal/toy-midi/src/lib/project-store.ts:678-755`
- Pure serialization, schema migration, and hydration: `/home/hiroshi/code/personal/toy-midi/src/lib/project-store.ts:757-866`

**Review domains and correctness arguments**

1. The top of `project-storage.ts` states the durable product policy: compatible document evolution migrates lazily, while breaking or lossy changes require a layout generation and recoverable copy-before-delete migration.
2. `ProjectStorage` presents operations in product vocabulary such as create, load, save, metadata, preferences, and assets. Callers do not handle localStorage key composition or IndexedDB transactions.
3. `migrateLayoutV1` has a storage durability argument: copy all surviving documents first, make the new list write the commit point, then delete old keys. A crash before commit leaves the legacy source intact.
4. `project-store.ts` handles a separate compatibility argument: persisted fields are selected explicitly, transient waveform and selection state are excluded or reconstructed, v1 documents become v2 values, and missing fields receive defaults.
5. `IdbStore` isolates browser request and transaction mechanics from asset-sharing policy.

**Why this helps linear review**

A reviewer can separately ask:

- Is this document migration semantically correct?
- Is the physical layout migration crash-recoverable?
- Does serialization omit transient state?
- Are IndexedDB operations resolved only after transaction completion?

Those questions would be difficult to review linearly if key migration, schema conversion, and raw browser callbacks were interleaved.

The test suite mirrors the domains: value persistence in `/home/hiroshi/code/personal/toy-midi/e2e/persistence.spec.ts:23-367`, document migration in `/home/hiroshi/code/personal/toy-midi/e2e/project-migration.spec.ts:40-132`, and layout migration beginning at line 134.

**Caveats**

- Loaded project JSON is cast to `AnySavedProject` at `/home/hiroshi/code/personal/toy-midi/src/lib/project-storage.ts:164` rather than runtime-validated.
- The accepted multi-tab race limitations are explicit at lines 43-46.
- Asset garbage collection is intentionally absent, and project deletion therefore does not remove unreferenced binaries.
- Persistence schema and live editor state share the large `project-store.ts` module. The pure conversion boundary is good, but physical module ownership is less clean than the conceptual boundary.

---

### 6. Score-viewer UI policy is separated from imperative renderer lifecycle, geometry, and clock implementations

**Key boundaries**

- React-level source, settings, shortcuts, and load policy: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer.tsx:39-145`
- Runtime-owned DOM and renderer state: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:76-136`
- Attach/load/control/dispose lifecycle: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:145-298`
- Cursor and seeking behavior: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:300-378`
- OSMD geometry adapters: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:438-597`
- Shared clock contract and standalone clock: `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:599-672`
- Editor audio-clock adapter: `/home/hiroshi/code/personal/toy-midi/src/components/project-score-preview.tsx:12-21`

**Review domains and correctness arguments**

1. `ScoreViewer` owns product behavior: source selection, settings, title, keyboard command, initial-load deduplication, and when a changed setting triggers reload.
2. `ScoreViewerRuntime` owns imperative lifecycle: build DOM, initialize OSMD, load and render, update overlays, expose state, and clean up.
3. Geometry helpers own OSMD-specific correctness: convert page-local coordinates, synthesize system endpoints, interpolate only within a system, and construct full-measure click targets.
4. `ScoreViewerClock` isolates time ownership. The standalone viewer uses `PlayheadClock`, while project preview adapts the real audio transport without changing renderer logic.

**Why this helps linear review**

The React component remains reviewable as a product flow instead of being buried under hundreds of lines of SVG and OSMD coordinate traversal. The runtime public methods form a compact lifecycle API. A reviewer can then descend into coordinate mechanics only when reviewing cursor wrapping or click-to-seek behavior.

This is also a useful example of dependency inversion grounded in a real product distinction: standalone score playback and project-backed audio playback share rendering but not clock ownership.

**Caveats**

- The runtime module is still 672 lines and combines DOM lifecycle, cursor geometry, XML metadata parsing, and a clock implementation. The conceptual domains are clear, but some remain same-module boundaries.
- The constructor subscribes to the clock at `/home/hiroshi/code/personal/toy-midi/src/components/score-viewer-runtime.ts:120-135`, but the returned unsubscribe function is not retained, and `dispose` at lines 289-298 does not unsubscribe. This weakens lifecycle closure, especially for the project preview’s long-lived audio clock.
- Geometry relies on OSMD internal graphical-model APIs and rendered DOM conventions, so library upgrades require focused review even when product policy is unchanged.

## Overall pattern

The repository’s best boundaries do not hide product decisions behind generic abstractions. Instead, they keep policy in short orchestration paths and move code away only when it has a genuinely different proof obligation:

- musical meaning versus notation encoding;
- active-document behavior versus asynchronous restoration;
- mixer semantics versus Tone.js resource reconciliation;
- conversion semantics versus worker transport;
- document compatibility versus physical storage durability;
- score-viewer behavior versus imperative rendering geometry.

That distinction is what makes these examples effective for linear human review.
