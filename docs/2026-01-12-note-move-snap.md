# Note Move Snap Behavior Analysis

## Problem

When moving a note by dragging, the snap behavior depends on where you grab the note.
Grabbing near the end requires dragging much further to reach the next grid line.

## Simplest Case: Note length = Grid size

```
Grid: 0.5 beats
Note: starts at beat 2.0, duration 0.5 (ends at 2.5)

      beat 2      beat 2.5     beat 3      beat 3.5
         |           |           |           |
         +-----------+-----------+-----------+
         |  cell A   |  cell B   |  cell C   |

Initial:
         [===note===]
         ^
      start=2.0
```

**Most intuitive behavior:** Note should be in the grid cell where the mouse is.

```
Cursor in cell A (2.0-2.5) -> note at 2.0
Cursor in cell B (2.5-3.0) -> note at 2.5
Cursor in cell C (3.0-3.5) -> note at 3.0
```

**Current behavior (floor + raw offset):**

Grab note at beat 2.3 (middle), offsetBeat = 0.3

```
Cursor at 2.5 (cell B): floor((2.5 - 0.3) / 0.5) * 0.5 = floor(4.4) * 0.5 = 2.0  <-- WRONG!
Cursor at 2.6 (cell B): floor((2.6 - 0.3) / 0.5) * 0.5 = floor(4.6) * 0.5 = 2.0  <-- WRONG!
Cursor at 2.7 (cell B): floor((2.7 - 0.3) / 0.5) * 0.5 = floor(4.8) * 0.5 = 2.0  <-- WRONG!
Cursor at 2.8 (cell B): floor((2.8 - 0.3) / 0.5) * 0.5 = floor(5.0) * 0.5 = 2.5  <-- finally!

         [===note===]
         ^          cursor anywhere in 2.5-2.8 range
      still at 2.0!

Note doesn't move to cell B until cursor reaches 2.8, even though cursor
entered cell B at 2.5. This feels broken.
```

**Intuitive behavior = snap note to cursor's grid cell:**

```typescript
noteStart = floor(cursor / grid) * grid; // ignore offset entirely
```

```
Cursor at 2.5: floor(2.5 / 0.5) * 0.5 = 2.5  <-- correct!
Cursor at 2.7: floor(2.7 / 0.5) * 0.5 = 2.5  <-- correct!
Cursor at 2.9: floor(2.9 / 0.5) * 0.5 = 2.5  <-- correct!
```

**Trade-off:** Note may "jump" on drag start if you grab off-grid. But for
grid-sized notes, this is exactly what you'd expect.

---

## Multi-Grid Notes (duration = 2 cells)

```
Grid: 0.5 beats
Note: starts at beat 2.0, duration 1.0 (spans 2 cells)

      beat 2      beat 2.5     beat 3      beat 3.5     beat 4
         |           |           |           |           |
         +-----------+-----------+-----------+-----------+
         |  cell 4   |  cell 5   |  cell 6   |  cell 7   |

Initial:
         [=========note=========]
         ^         ^            ^
      start=2.0  mid=2.5     end=3.0
         cell 4    cell 5
```

**Key insight:** Think in terms of CELLS, not raw beats.

The note occupies cells 4-5. When grabbing, you're grabbing a specific cell
within the note:

```
cellOffset = floor((grabBeat - noteStart) / grid)

Grab at 2.2 (cell 4): cellOffset = floor(0.2 / 0.5) = 0  (first cell)
Grab at 2.7 (cell 5): cellOffset = floor(0.7 / 0.5) = 1  (second cell)
```

**Intuitive behavior:** The cell you grabbed should follow the cursor's cell.

```typescript
cursorCell = floor(cursor / grid);
noteStartCell = cursorCell - cellOffset;
noteStart = noteStartCell * grid;
```

### Case: Grab in FIRST cell (at 2.2, cellOffset = 0)

```
Cursor in cell 4 (2.0-2.5): noteStart = (4-0)*0.5 = 2.0
         [=========note=========]
         ^ cursor here

Cursor in cell 5 (2.5-3.0): noteStart = (5-0)*0.5 = 2.5
                   [=========note=========]
                   ^ cursor here

Cursor in cell 6 (3.0-3.5): noteStart = (6-0)*0.5 = 3.0
                             [=========note=========]
                             ^ cursor here
```

The first cell of the note tracks the cursor's cell. Intuitive!

### Case: Grab in SECOND cell (at 2.7, cellOffset = 1)

```
Cursor in cell 4 (2.0-2.5): noteStart = (4-1)*0.5 = 1.5
    [=========note=========]
              ^ cursor here (2nd cell of note = cell 4)

Cursor in cell 5 (2.5-3.0): noteStart = (5-1)*0.5 = 2.0
         [=========note=========]
                   ^ cursor here (2nd cell of note = cell 5)

Cursor in cell 6 (3.0-3.5): noteStart = (6-1)*0.5 = 2.5
                   [=========note=========]
                             ^ cursor here (2nd cell of note = cell 6)
```

The second cell of the note tracks the cursor's cell. Also intuitive!

### Generalization

```typescript
// On drag start:
cellOffset = Math.floor((grabBeat - noteStart) / gridSnapValue);

// On mouse move:
cursorCell = Math.floor(cursor / gridSnapValue);
noteStart = (cursorCell - cellOffset) * gridSnapValue;
```

This is "quantized offset" - the offset is snapped to whole grid cells.

**Behavior:**

- Note moves when cursor crosses a grid line
- The specific cell you grabbed maintains its relationship to cursor
- No "lag zone" - cursor in cell X means grabbed cell is in cell X
- Note may jump slightly on grab (sub-cell position is discarded)

---

## Current Implementation

```typescript
// On drag start:
offsetBeat = beat - clickedNote.start; // where within the note you clicked

// On mouse move:
snappedBeat = snapToGrid(beat - offsetBeat, gridSnapValue); // uses Math.floor
newStart = Math.max(0, snappedBeat);
```

## Scenario Analysis

```
Grid: 1/8 note = 0.5 beats = 40px
Note: starts at beat 2.0, duration 1.0 (ends at beat 3.0)

      beat 2      beat 2.5     beat 3      beat 3.5     beat 4
         |           |           |           |           |
         +-----------+-----------+-----------+-----------+
         |   40px    |   40px    |   40px    |   40px    |

Initial note position:
         [===========note========]
         ^                       ^
      start=2.0               end=3.0
```

### Case A: Grab near START (beat 2.1)

```
         [===========note========]
           ^
        grab at 2.1, offsetBeat = 0.1

Goal: Move note to start at beat 3.0

Current (floor):
  - Need: beat - 0.1 >= 3.0
  - Need: beat >= 3.1
  - Cursor must reach beat 3.1 (just past the grid line)

                    [===========note========]
                    ^           cursor at 3.1
                 start=3.0

With round:
  - Need: beat - 0.1 >= 2.75 (halfway to 3.0)
  - Need: beat >= 2.85
  - Cursor only needs to reach beat 2.85

Difference: 3.1 - 2.85 = 0.25 beats = 20px extra drag with floor
```

### Case B: Grab in MIDDLE (beat 2.5)

```
         [===========note========]
                    ^
                 grab at 2.5, offsetBeat = 0.5

Goal: Move note to start at beat 3.0

Current (floor):
  - Need: beat - 0.5 >= 3.0
  - Need: beat >= 3.5
  - Cursor must reach beat 3.5

With round:
  - Need: beat - 0.5 >= 2.75
  - Need: beat >= 3.25

Difference: 3.5 - 3.25 = 0.25 beats = 20px extra drag with floor
```

### Case C: Grab near END (beat 2.9)

```
         [===========note========]
                                ^
                             grab at 2.9, offsetBeat = 0.9

Goal: Move note to start at beat 3.0

Current (floor):
  - Need: beat - 0.9 >= 3.0
  - Need: beat >= 3.9
  - Cursor must reach beat 3.9 (almost a full beat past!)

                    [===========note========]
                    ^                              cursor at 3.9
                 start=3.0                              ^

With round:
  - Need: beat - 0.9 >= 2.75
  - Need: beat >= 3.65

Difference: 3.9 - 3.65 = 0.25 beats = 20px extra drag with floor
```

## Option 1: Use round (like resize)

Change `snapToGrid` to `Math.round` for moving:

```typescript
const snappedBeat =
  Math.round((beat - offsetBeat) / gridSnapValue) * gridSnapValue;
```

**Pros:**

- Consistent with resize behavior
- Reduces perceived "stickiness" by 0.25 beats uniformly

**Cons:**

- Still has variable feel depending on grab position
- Grab at end (Case C) still needs cursor at 3.65 vs 3.1 for Case A

## Option 2: Quantize offset at drag start

Snap the grab offset to grid on drag start:

```typescript
// On drag start:
rawOffset = beat - clickedNote.start;
offsetBeat = Math.round(rawOffset / gridSnapValue) * gridSnapValue;

// On mouse move (same as before):
snappedBeat = snapToGrid(beat - offsetBeat, gridSnapValue);
```

**Example with Case C (grab at 2.9):**

```
Raw offsetBeat = 2.9 - 2.0 = 0.9
Quantized offsetBeat = round(0.9 / 0.5) * 0.5 = 1.0

Goal: Move note to start at beat 3.0
  - Need: beat - 1.0 >= 3.0
  - Need: beat >= 4.0

Hmm, this makes it WORSE for this case...
```

**Example with floor-quantized offset:**

```
Quantized offsetBeat = floor(0.9 / 0.5) * 0.5 = 0.5

Goal: Move note to start at beat 3.0
  - Need: beat - 0.5 >= 3.0
  - Need: beat >= 3.5

Same as Case B - normalized behavior!
```

## Option 3: Quantize offset with floor

```typescript
// On drag start:
rawOffset = beat - clickedNote.start;
offsetBeat = Math.floor(rawOffset / gridSnapValue) * gridSnapValue;

// On mouse move:
snappedBeat = snapToGrid(beat - offsetBeat, gridSnapValue); // floor
```

This "snaps" your grab point to the left edge of the grid cell you clicked in.

```
Case A: grab 2.1 -> offset floor(0.1/0.5)*0.5 = 0.0 -> need cursor >= 3.0
Case B: grab 2.5 -> offset floor(0.5/0.5)*0.5 = 0.5 -> need cursor >= 3.5
Case C: grab 2.9 -> offset floor(0.9/0.5)*0.5 = 0.5 -> need cursor >= 3.5
```

**Pros:**

- Normalizes behavior within each grid cell
- Grab anywhere in first half of note: offset = 0, cursor needs >= 3.0
- Grab anywhere in second half: offset = 0.5, cursor needs >= 3.5

**Cons:**

- Note "jumps" slightly on drag start (snaps to quantized offset)
- May feel jarring

## Option 4: Quantize offset with floor + use round for move

Combine quantized offset with round-based snapping:

```typescript
// On drag start:
offsetBeat = Math.floor(rawOffset / gridSnapValue) * gridSnapValue;

// On mouse move:
snappedBeat = Math.round((beat - offsetBeat) / gridSnapValue) * gridSnapValue;
```

```
Case A: offset=0.0, need cursor >= 2.75 to snap to 3.0
Case B: offset=0.5, need cursor >= 3.25 to snap to 3.0
Case C: offset=0.5, need cursor >= 3.25 to snap to 3.0
```

## Recommendation

**Option 1 (round only)** is simplest and consistent with resize.
The 0.25 beat improvement is uniform and doesn't require changing drag start logic.

## Status

- [x] Analysis complete
- [x] Decision: Cell-based approach (Option 3)
- [x] Implementation for note move (cellOffset)
- [x] Implementation for note resize (2026-01-13)

## Implementation Notes

### Move (implemented)

```typescript
// On drag start:
cellOffset = Math.floor((grabBeat - noteStart) / gridSnapValue);

// On drag:
cursorCell = Math.floor(cursor / gridSnapValue);
noteStart = (cursorCell - cellOffset) * gridSnapValue;
```

### Resize (implemented 2026-01-13)

Applied same cell-based principle to resize:

```typescript
// resizing-end:
cursorCell = Math.floor(cursor / gridSnapValue);
newEnd = (cursorCell + 1) * gridSnapValue;

// resizing-start:
cursorCell = Math.floor(cursor / gridSnapValue);
newStart = cursorCell * gridSnapValue;
```

The cursor's cell determines the edge position. Crossing a grid boundary
triggers the snap, regardless of where you grabbed within the edge threshold.
