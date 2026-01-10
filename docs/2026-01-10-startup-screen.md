# Startup Screen Implementation

## Problem

The current init flow in `app.tsx` has issues:

1. **No user gesture before audio init**: `audioManager.loadFromUrl()` is called in useEffect without prior `audioManager.init()`. AudioContext may be suspended, causing silent failures.
2. **Nested async in useEffect**: Race conditions possible if component unmounts during async chain.
3. **Loading screen is passive**: Shows "Loading..." but doesn't satisfy browser's user gesture requirement.

## Approach

Create a `StartupScreen` component that requires user interaction before loading audio:

```
App mounts
    ↓
Show StartupScreen
    ├─ "New Project" button (always shown)
    └─ "Continue" button (shown if saved project exists)
    ↓
User clicks (gesture!)
    ↓
audioManager.init()  ← guaranteed to work
    ↓
If "Continue": restore localStorage → IndexedDB → audio load
If "New Project": clear state, skip restore
    ↓
Show main UI (Transport + PianoRoll)
```

## Reference Files

- `src/app.tsx` - Current init flow to replace
- `src/lib/audio.ts` - AudioManager.init() method
- `docs/architecture.md` - "Persistence & Init Flow" section

## Implementation Steps

1. **Create StartupScreen component** (`src/components/startup-screen.tsx`)
   - Simple centered UI with "Click to start" button
   - Accept `onStart` callback prop

2. **Refactor App.tsx state machine**
   - States: `"startup"` → `"loading"` → `"ready"`
   - `startup`: Show StartupScreen
   - `loading`: User clicked, run init + restore sequence
   - `ready`: Show main UI

3. **Extract restore logic into async function**
   - Move current useEffect body into `restoreProject()` function
   - Call `audioManager.init()` first (now inside user gesture handler)
   - Sequential: load localStorage → load IndexedDB → load audio

4. **Update Transport.tsx**
   - Remove `audioManager.init()` from Transport's useEffect (it's now called in App)
   - Keep volume sync logic

## E2E Test Cases

File: `e2e/startup-screen.spec.ts`

1. **Startup screen appears on initial load** - Shows startup UI, not main UI
2. **"New Project" button is always visible** - Even with no saved project
3. **"Continue" button only shows when saved project exists** - Check localStorage
4. **Clicking "New Project" shows main UI with empty state** - No notes, default tempo
5. **Clicking "Continue" restores saved project** - Notes, tempo, settings restored
6. **Main UI hidden until startup choice made** - Transport/PianoRoll not visible initially

## Feedback Log

- User gesture requirement is the main driver
- Should offer "Continue" vs "New Project" choice (not auto-restore)
- **2026-01-10**: Added Enter key support as quick path - pressing Enter continues saved project if exists, otherwise starts new project

## Status

- [x] Task doc created
- [x] E2E test skeletons created
- [x] Implementation started
- [x] Implementation complete
- [x] Tests passing (36/36)
- [x] Enter key support added (quick path to continue or start)
