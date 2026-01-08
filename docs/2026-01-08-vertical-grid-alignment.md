# Vertical Grid Alignment

## Problem

Background grid lines don't align with note cells and keyboard rows when viewport has fractional scroll offset.

**Observed behavior:**
- At integer scrollY (e.g., 72.0000): grid aligns correctly
- At fractional scrollY (e.g., 70.8920): grid appears misaligned

**What IS aligned:**
- Notes and keyboard rows align correctly with each other

**What is NOT aligned:**
- CSS background grid lines vs note/keyboard positions

## Current Implementation

### Note Y Position (SVG)
```typescript
const y = (MAX_PITCH - scrollY - note.pitch) * pixelsPerKey;
```

### Grid Row Offset (CSS background-position)
```typescript
const rowOffsetY = -(scrollY % 1) * pixelsPerKey;
```

### Grid Pattern (CSS repeating-linear-gradient)
```typescript
const rowLines = `repeating-linear-gradient(
  0deg,
  #404040 0px,
  #404040 1px,
  transparent 1px,
  transparent ${pixelsPerKey}px
)`;
```

## Debug Analysis

For scrollY = 70.8920, pixelsPerKey = 20:

| Calculation | Value |
|------------|-------|
| scrollY % 1 | 0.8920 |
| rowOffsetY | -17.84px |
| Grid lines at | -17.84, 2.16, 22.16, 42.16... |
| A3 (pitch 57) row top | -17.84px |
| G#3 (pitch 56) row top | 2.16px |
| G3 (pitch 55) row top | 22.16px |

**Math checks out** - grid line positions match row top positions exactly.

## Hypotheses

1. **CSS sub-pixel rendering**: CSS `background-position` with fractional pixels may render differently than SVG fractional coordinates

2. **Box model mismatch**: Keyboard uses `border-b` (inside element with border-box), grid pattern uses position 0-1 (at exact pixel boundary)

3. **Floating point precision**: Small differences in how `scrollY % 1` vs `(MAX_PITCH - scrollY - pitch)` are computed

## Debug Panel

Added debug panel (toggle via Debug button in toolbar) showing:
- Viewport state (scrollX, scrollY, pixelsPerBeat, pixelsPerKey)
- Grid line positions
- Row top positions for visible pitches
- Diff between row[0] and gridLine[0] positions

## Files

- `src/components/piano-roll.tsx` - grid generation and note rendering

## Next Steps

- [ ] Check if Diff in debug panel shows non-zero value
- [ ] Test with rounded pixel values for grid offset
- [ ] Consider SVG-based grid lines instead of CSS background
- [ ] Investigate browser dev tools to see actual rendered positions

## Status

**Investigating** - Math appears correct, likely CSS rendering issue with fractional pixels
