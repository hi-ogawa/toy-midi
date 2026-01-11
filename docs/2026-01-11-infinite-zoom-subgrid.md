# Semi-Infinite Zoom Out - Hide Subgrid Lines

## Problem Context

**Goal:** Allow overviewing entire song (standard DAW feature).

**Current limitation:** Max 24 bars visible on a 1920px screen.

- 24 bars × 4 beats × 20 px/beat = 1920px
- MIN_PIXELS_PER_BEAT = 20 is the bottleneck

**Target:** Support 200-400+ bar songs.

| Song Length | Beats | Required px/beat | Bar Width |
| ----------- | ----- | ---------------- | --------- |
| 100 bars    | 400   | 4.8              | 19px      |
| 200 bars    | 800   | 2.4              | 10px      |
| 400 bars    | 1600  | 1.2              | 5px       |

At 1-2 px/beat, bar lines are still 4-8px apart (visible), but beat/subbeat lines must be hidden.

## Reference Files

| File                            | Lines  | What                       |
| ------------------------------- | ------ | -------------------------- |
| `src/components/piano-roll.tsx` | 34-40  | Zoom constraints           |
| `src/components/piano-roll.tsx` | 48-138 | `generateGridBackground()` |
| `src/components/piano-roll.tsx` | 97-130 | Grid layer definitions     |
| `src/types.ts`                  | 9-18   | Grid snap values           |

## Approach

Progressive grid simplification based on **absolute pixel spacing** (not zoom level):

| Line Type     | Min Spacing | Hide When                           |
| ------------- | ----------- | ----------------------------------- |
| Subbeat lines | 8px         | `subBeatWidth < 8`                  |
| Beat lines    | 8px         | `beatWidth < 8`                     |
| Bar lines     | 8px         | `barWidth < 8` (show every 2nd/4th) |

This translates to:

| px/beat | Bar (4 beats) | Beat   | Subbeat (1/16) | Visible                 |
| ------- | ------------- | ------ | -------------- | ----------------------- |
| 20+     | 80px+         | 20px+  | 5px+           | bars, beats, subbeats\* |
| 8-20    | 32-80px       | 8-20px | 2-5px          | bars, beats             |
| 2-8     | 8-32px        | 2-8px  | <2px           | bars only               |
| <2      | <8px          | <2px   | -              | every Nth bar           |

\*Subbeat visibility also depends on grid snap setting (1/16 = 0.25 beats)

### Key Changes

1. **Reduce MIN_PIXELS_PER_BEAT** from 20 → 1 (support 400+ bars)
2. **Threshold-based layer visibility** in `generateGridBackground()`:
   - Hide subbeat gradient when `subBeatWidth < 8`
   - Hide beat gradient when `beatWidth < 8`
   - At extreme zoom: show every 4th bar line when `barWidth < 8`

## Implementation Steps

### Phase 1: Basic threshold-based hiding (done)

- [x] Add threshold constants for grid visibility
- [x] Modify `generateGridBackground()` to conditionally include layers
- [x] Reduce `MIN_PIXELS_PER_BEAT` to allow deeper zoom

### Phase 2: Coarse grid at extreme zoom (done)

- [x] Show every Nth bar line when barWidth < threshold
  - Use powers of 2 multiplier: 1, 2, 4, 8, 16 bars
  - Find smallest N where `barWidth * N >= MIN_LINE_SPACING`

### Phase 3: Timeline label spacing (done)

- [x] Prevent overlapping bar numbers in Timeline component
  - Added `MIN_LABEL_SPACING = 30` constant
  - Dynamic step: show every Nth bar (powers of 2) where spacing >= 30px

## Feedback Log

- User: Goal is song overview (standard DAW feature). Current 24-bar limit is the issue.
- User: At extreme zoom, need coarser grid (every 4/16 bars). Timeline bar numbers overlap.

## Status

- **Done:** All phases complete
  - Phase 1: Basic threshold-based hiding
  - Phase 2: Coarse grid (every Nth bar) at extreme zoom
  - Phase 3: Timeline label spacing
- **Remaining:** Manual testing
- **Blockers:** None
