# Short-term TODO

Focused tasks for next few sessions. See `prd.md` for full roadmap.

## ~~Startup Screen~~ (Done)

See `docs/2026-01-10-startup-screen.md` for implementation and follow-up items.

## ~~Audio ↔ State Sync Refactor~~ (Done)

See `docs/2026-01-10-audio-state-sync-refactor.md` for complete implementation details.

**All issues resolved:**

- [x] Two sources of truth (AudioManager is now single source)
- [x] RAF loop performance (only runs when playing)
- [x] Volume sync (reactive effects handle all cases)
- [x] Dynamic note scheduling (notes during playback work)
