# Short-term TODO

Focused tasks for next few sessions. See `prd.md` for full roadmap.

## 1. E2E Testing Infrastructure (in progress)

**Goal:** Clean, reliable tests for agent-driven development.

**Doc:** `docs/2026-01-10-e2e-testing.md`

**Tasks:**

- [ ] Expose `window.__store` in dev mode
- [ ] Create `evaluateStore(page, fn)` helper
- [ ] Refactor fragile tests to use store API
- [ ] Delete redundant `audio.spec.ts`
- [ ] Ensure all tests pass: `pnpm test-e2e`

**Why first:** Flaky tests block confident iteration. Need stable foundation.

## 2. Startup Screen

**Goal:** Solve AudioContext + persistence/init flow issues.

**Doc:** See `architecture.md` → "Persistence & Init Flow"

**Tasks:**

- [ ] Create `StartupScreen` component ("Click to start")
- [ ] On click: `audioManager.init()` (guaranteed user gesture)
- [ ] Sequential restore: localStorage → IndexedDB → audio load
- [ ] Remove nested async useEffect from App.tsx
- [ ] Show main UI after restore complete

**Why:** Foundation for clean audio state. Fixes race conditions in restore flow.

## 3. Audio ↔ State Sync Refactor

**Goal:** Single source of truth, eliminate sync bugs.

**Doc:** See `architecture.md` → "Audio ↔ State Sync"

**Issues to address:**

- [ ] Two sources of truth (`store.isPlaying` vs `audioManager.isPlaying`)
- [ ] RAF loop updates store 60/sec (performance)
- [ ] Volume sync only on mount (misses external changes)
- [ ] Note scheduling is snapshot-based (notes during playback don't sound)

**Approaches to evaluate:**

- AudioManager as source of truth (store subscribes to events)
- Zustand middleware for audio sync
- Selective subscription (avoid full re-renders)

**Why:** Current architecture has subtle bugs. Worth fixing before adding features.
