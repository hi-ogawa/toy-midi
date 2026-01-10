# Short-term TODO

Focused tasks for next few sessions. See `prd.md` for full roadmap.

## ~~Startup Screen~~ (Done)

See `docs/2026-01-10-startup-screen.md` for implementation and follow-up items.

## E2E Test Refactoring (In Progress)

**Goal:** Refactor tests to use `evaluateStore` helper for more robust state setup/verification.

**Doc:** See `docs/2026-01-10-e2e-testing.md`

**Status:**
- [x] Refactored 9 persistence tests to use `evaluateStore` (PR #3)
- [ ] 3 piano-roll keyboard tests blocked - store updates via `page.evaluate` don't trigger React re-renders

**Remaining (optional):**
- [ ] Investigate React re-render issue with external store mutations
- [ ] Additional test coverage (audio offset, volume sliders, zoom/pan)

## Audio ↔ State Sync Refactor

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
