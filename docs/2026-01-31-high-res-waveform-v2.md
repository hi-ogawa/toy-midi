# Higher Resolution Waveform at Zoom

## First Principles: Downsampling Limits

**Baseline:** 100 BPM, 3 min song, 48 kHz

| Unit      | Duration | Samples   |
| --------- | -------- | --------- |
| 16th note | 0.15 sec | 7,200     |
| 8th note  | 0.3 sec  | 14,400    |
| Beat      | 0.6 sec  | 28,800    |
| Bar       | 2.4 sec  | 115,200   |
| Full song | 180 sec  | 8,640,000 |

Song = 75 bars = 300 beats = 1,200 16th notes

### How much can we downsample?

**Core question:** How many samples can we collapse into one peak before losing musical detail?

A 16th note = 7,200 samples. To see it as a distinct transient (not merged with neighbors), we need at least 2-4 peaks to represent it.

| Samples/Peak | Peaks per 16th | Can distinguish 16th notes? |
| ------------ | -------------- | --------------------------- |
| 7,200        | 1              | No - merged with neighbors  |
| 3,600        | 2              | Barely                      |
| 1,800        | 4              | Yes                         |
| 900          | 8              | Clear                       |

**Max useful downsampling:** ~1,800 samples/peak (gives 4 peaks per 16th note)

### Current Implementation (Two-Stage)

**Stage 1 - Peak extraction:** 100 peaks/sec

- At 48kHz: 480 samples/peak
- = 15 peaks per 16th note ✓ (plenty of detail)

**Stage 2 - SVG rendering:** Fixed 500 points for entire song

For 3-min song:

- 8,640,000 samples → 500 points = **17,280 samples/peak**
- = 0.4 peaks per 16th note ✗

We can't even see individual beats, let alone 16th notes.

### The Bug

Stage 1 extracts enough detail. Stage 2 throws it all away.

The 500-point limit makes quality dependent on total audio length:

| Audio Length | Stage 1 Peaks | Stage 2 Output | Samples/Point |
| ------------ | ------------- | -------------- | ------------- |
| 1 min        | 6,000         | 500            | 5,760         |
| 3 min        | 18,000        | 500            | 17,280        |
| 10 min       | 60,000        | 500            | 57,600        |

Longer songs get worse quality. This is backwards.

### Display: Peaks to Pixels

Once we have peaks, mapping to screen:

| Situation               | Result                                |
| ----------------------- | ------------------------------------- |
| More peaks than pixels  | Downsample for display (fine)         |
| Fewer peaks than pixels | Stretchy/blocky (can't invent detail) |

At 1920px viewport, 500 peaks is marginal for full-song view and terrible for zoomed views.

---

## Current Implementation

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  File Load (src/lib/audio.ts)                                           │
│                                                                         │
│  loadAudioFile(file)                                                    │
│    └─> getAudioBufferPeaks(buffer, 100)    ← Stage 1: 480 samples/peak │
│          └─> peaks[] stored in project-store                            │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Render (src/components/piano-roll.tsx)                                 │
│                                                                         │
│  WaveformArea                                                           │
│    ├─ receives: audioPeaks[], scrollX, pixelsPerBeat                    │
│    ├─ positions audio block based on offset/duration                    │
│    └─> Waveform component                                               │
│          └─> Downsample to 500 points      ← Stage 2: THE BUG          │
│          └─> SVG <path> with viewBox 0-1000                             │
│          └─> CSS stretches to container width                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Code Locations

| File                                 | Function                | What it does                            |
| ------------------------------------ | ----------------------- | --------------------------------------- |
| `src/lib/audio.ts:390`               | `getAudioBufferPeaks()` | Stage 1: Extract peaks at 100/sec       |
| `src/lib/audio.ts:415`               | `loadAudioFile()`       | Orchestrates load + peak extraction     |
| `src/components/piano-roll.tsx:1786` | `Waveform()`            | Stage 2: Downsample to 500 + render SVG |
| `src/components/piano-roll.tsx:1607` | `WaveformArea()`        | Container, positions waveform block     |

### Current Waveform Component (the bug)

```typescript
function Waveform({ peaks, height }) {
  // BUG: Fixed 500 points regardless of audio length or zoom
  const maxPoints = 500;
  const step = Math.max(1, Math.floor(peaks.length / maxPoints));

  // Downsample by taking max of each chunk
  for (let i = 0; i < peaks.length; i += step) { ... }

  // Render to fixed viewBox, CSS stretches to fit
  <svg viewBox="0 0 1000 {height}" preserveAspectRatio="none">
    <path d={pathData} />
  </svg>
}
```

**Problems:**

1. `peaks.length / 500` = more aggressive downsampling for longer audio
2. No awareness of `scrollX` or visible viewport
3. SVG covers entire audio duration, CSS scales it

### What WaveformArea Already Has

The parent component `WaveformArea` receives:

- `scrollX` - current horizontal scroll position (in beats)
- `pixelsPerBeat` - current zoom level
- `viewportWidth` - visible area width
- `audioPeaks` - full peaks array
- `audioOffset` / `audioDuration` - timing info

**It already calculates visible region** for positioning the audio block:

```typescript
const audioStartX = (audioOffsetBeats - scrollX) * pixelsPerBeat;
```

But it passes the **entire** `audioPeaks` array to `Waveform`, which then:

1. Downsamples to 500 points (losing detail)
2. Renders all of it (even off-screen parts)

### Fix Strategy

Pass viewport info to `Waveform`, so it can:

1. Calculate which peaks are visible based on `scrollX` and `viewportWidth`
2. Slice `peaks[]` to visible range only
3. Remove or adjust the 500-point limit (may not be needed for visible-only data)

---

## Problem

The waveform has two separate issues:

### Issue 1: Audio-length-dependent quality (bug)

Current implementation downsamples to fixed 500 SVG points regardless of audio length:

| Audio Length | Peaks (100/sec) | Downsampling | Result     |
| ------------ | --------------- | ------------ | ---------- |
| 5 minutes    | 30,000          | 60:1         | Acceptable |
| 30 minutes   | 180,000         | 360:1        | 6x worse   |

**Longer files look progressively worse.** This is backwards.

### Issue 2: No zoom detail (limitation)

Waveform is extracted at fixed 100 peaks/second. Zooming in just stretches the same data - it becomes blocky instead of revealing more detail.

## Root Cause

The current approach renders the **entire audio file** with no awareness of:

- **Viewport**: What's actually visible on screen
- **Zoom level**: How much detail is appropriate

## Orthogonal Concerns

Three independent dimensions to consider:

| Concern            | Options                         | Notes                                       |
| ------------------ | ------------------------------- | ------------------------------------------- |
| **What to render** | Entire file vs visible viewport | Viewport culling fixes Issue 1              |
| **Resolution**     | Fixed vs adaptive to zoom       | Adaptive fixes Issue 2                      |
| **Rendering tech** | SVG vs Canvas                   | Performance optimization, separate decision |

These can be addressed independently.

## Solutions

### Fix 1: Viewport Culling

- Calculate visible time range from scroll position
- Pass only visible peaks to renderer
- Keep 100 peaks/sec resolution

**Fixes:** Issue 1 (audio-length bug)
**Effort:** Low (1-2 hours)

### Fix 2: Adaptive Resolution

- Calculate target resolution based on zoom (e.g., 2 peaks/pixel)
- Extract peaks on-demand from audio buffer

**Fixes:** Issue 2 (zoom detail)
**Effort:** Medium (3-4 hours, requires Fix 1 first)

### Optional: Switch to Canvas

Canvas is **not a fix** - it's a performance optimization for rendering.

Only consider if SVG proves slow at higher peak counts after implementing Fix 1 or Fix 2. The current 500-point limit may be overly conservative for 2026 browsers.

## Recommendation

1. **Implement Fix 1** (viewport culling)
   - Fixes the critical bug
   - Minimal effort, low risk

2. **Implement Fix 2 if needed** (adaptive resolution)
   - Only if users want better zoom detail
   - Depends on Fix 1

3. **Switch to Canvas only if SVG is slow**
   - Measure first, don't assume
   - Orthogonal to both fixes

## Status

**Created:** 2026-01-31
**Status:** Ready for review

## Feedback Log

_(Append feedback here)_
