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

## Math Explanation: Grid Row Offset

### Goal

Grid lines should appear at the boundary between pitch rows. When we scroll, the grid must shift to stay aligned with the note positions.

### Coordinate System

- **scrollY**: How many semitones we've scrolled down from MAX_PITCH (127)
- **topPitch**: The pitch visible at y=0 of the viewport = `MAX_PITCH - scrollY`
- **pixelsPerKey**: Height of one pitch row in pixels

### Note Position Formula

For a note at pitch P, its Y position on screen is:

```
y(P) = (MAX_PITCH - scrollY - P) * pixelsPerKey
```

Example with scrollY = 72, pixelsPerKey = 20:

- Pitch 55 (G3): y = (127 - 72 - 55) _ 20 = 0 _ 20 = 0px
- Pitch 54 (F#3): y = (127 - 72 - 54) _ 20 = 1 _ 20 = 20px
- Pitch 53 (F3): y = (127 - 72 - 53) _ 20 = 2 _ 20 = 40px

### Grid Pattern Behavior

CSS `repeating-linear-gradient` creates a pattern that tiles infinitely. With:

```css
background-position: 0 ${rowOffsetY}px;
```

The pattern's y=0 aligns with screen position `rowOffsetY`.

Since the pattern has a line at position 0-1px, lines appear at:

```
rowOffsetY, rowOffsetY + pixelsPerKey, rowOffsetY + 2*pixelsPerKey, ...
```

### Why `-(scrollY % 1) * pixelsPerKey`?

**Integer scrollY (e.g., scrollY = 72):**

- topPitch = 127 - 72 = 55 (G3)
- G3's row starts at y = 0
- Grid line should be at y = 0
- rowOffsetY = -(72 % 1) _ 20 = -0 _ 20 = 0 ✓

**Fractional scrollY (e.g., scrollY = 72.5):**

- topPitch = 127 - 72.5 = 54.5 (between G3 and F#3)
- We've scrolled half a row past G3
- G3's row now starts at y = (127 - 72.5 - 55) _ 20 = -0.5 _ 20 = -10px
- Grid line should be at y = -10px
- rowOffsetY = -(72.5 % 1) _ 20 = -0.5 _ 20 = -10 ✓

### The Key Insight

The fractional part of scrollY (`scrollY % 1`) represents how far we've scrolled within a single pitch row. Multiplying by pixelsPerKey converts this to pixels, and negating shifts the grid up to match.

### Derivation

For the top visible pitch (integer part):

```
topPitchInt = MAX_PITCH - floor(scrollY)
y(topPitchInt) = (MAX_PITCH - scrollY - topPitchInt) * pixelsPerKey
              = (MAX_PITCH - scrollY - (MAX_PITCH - floor(scrollY))) * pixelsPerKey
              = (floor(scrollY) - scrollY) * pixelsPerKey
              = -(scrollY - floor(scrollY)) * pixelsPerKey
              = -(scrollY % 1) * pixelsPerKey
              = rowOffsetY
```

This proves that `rowOffsetY` equals the Y position of the first integer pitch row.

## Debug Analysis

For scrollY = 70.8920, pixelsPerKey = 20:

| Calculation            | Value                         |
| ---------------------- | ----------------------------- |
| scrollY % 1            | 0.8920                        |
| rowOffsetY             | -17.84px                      |
| Grid lines at          | -17.84, 2.16, 22.16, 42.16... |
| A3 (pitch 57) row top  | -17.84px                      |
| G#3 (pitch 56) row top | 2.16px                        |
| G3 (pitch 55) row top  | 22.16px                       |

**Math checks out** - grid line positions match row top positions exactly.

## Bugs Found & Fixed

### Bug 1: Gradient Direction (0deg vs 180deg)

**Issue**: `0deg` in CSS gradients means bottom-to-top, but our coordinate system has y=0 at top.

**Fix**: Use `180deg` (top-to-bottom) for horizontal line gradients.

```typescript
// Wrong - 0deg means bottom to top
`repeating-linear-gradient(0deg, #404040 0px, #404040 1px, transparent 1px, transparent ${pixelsPerKey}px)`
// Correct - 180deg means top to bottom
`repeating-linear-gradient(180deg, #404040 0px, #404040 1px, transparent 1px, transparent ${pixelsPerKey}px)`;
```

### Bug 2: Octave Line Position

**Issue**: Octave line was at top of C row, should be at B/C boundary (bottom of C row).

**Fix**: Add 1 to MAX_PITCH in the calculation:

```typescript
// Wrong - gives top of C row
const octaveOffsetY =
  ((((MAX_PITCH - scrollY) * pixelsPerKey) % octaveHeight) + octaveHeight) %
  octaveHeight;

// Correct - gives bottom of C row (B/C boundary)
const octaveOffsetY =
  ((((MAX_PITCH + 1 - scrollY) * pixelsPerKey) % octaveHeight) + octaveHeight) %
  octaveHeight;
```

### Bug 3: SVG + CSS Background Misalignment

**Issue**: CSS `background-position` on SVG elements behaved inconsistently.

**Fix**: Switched from SVG to HTML div for the grid container. Notes are now positioned divs instead of SVG rects.

## Remaining Issue: repeating-linear-gradient Visual Artifacts

### Symptoms

- Some grid lines appear/disappear or jump around during pan/zoom
- More noticeable with thin (1px) lines
- Occurs even when math is correct

### Root Cause

`repeating-linear-gradient` has known subpixel rendering issues:

1. **Cumulative subpixel error**: When gradient size doesn't align to whole pixels, fractional errors accumulate across repetitions
2. **Browser rendering**: Large gradients may render at lower resolution (Firefox bug 1716648)
3. **DPR/zoom sensitivity**: Artifacts depend on device pixel ratio and zoom level (Firefox bug 1763221)

### Research Sources

- [No-Jank CSS Stripes | CSS-Tricks](https://css-tricks.com/no-jank-css-stripes/)
- [repeating-linear-gradient() - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-linear-gradient)
- [Firefox Bug 1763221](https://bugzilla.mozilla.org/show_bug.cgi?id=1763221)
- [Firefox Bug 1716648](https://bugzilla.mozilla.org/show_bug.cgi?id=1716648)

### Recommended Solution

Use `linear-gradient` + `background-size` instead of `repeating-linear-gradient`:

```typescript
// Instead of
{
  backgroundImage: `repeating-linear-gradient(180deg, #404040 0px, #404040 1px, transparent 1px, transparent ${pixelsPerKey}px)`,
  backgroundPosition: `0 ${rowOffsetY}px`,
}

// Use
{
  backgroundImage: `linear-gradient(180deg, #404040 0px, #404040 1px, transparent 1px, transparent 100%)`,
  backgroundSize: `100% ${Math.round(pixelsPerKey)}px`,
  backgroundPosition: `0 ${rowOffsetY}px`,
}
```

Key points:

- Round `pixelsPerKey` to whole pixels for `background-size`
- Let browser handle repetition via `background-repeat` (default)
- Thicker lines (5px+) show fewer artifacts

## Debug Panel

Added debug panel (toggle via Debug button in toolbar) showing:

- Viewport state (scrollX, scrollY, pixelsPerBeat, pixelsPerKey)
- Grid line positions
- Row top positions for visible pitches
- Diff between row[0] and gridLine[0] positions
- B/C boundary calculation details

## Files

- `src/components/piano-roll.tsx` - grid generation and note rendering

## Next Steps

- [x] Refactor to use `linear-gradient` + `background-size` approach
- [x] Round pixelsPerKey/pixelsPerBeat to whole pixels for grid rendering
- [ ] Test across different zoom levels and DPR

## Status

**Complete** - Core math fixed, switched to `linear-gradient` + `background-size`, and all pixel values rounded to whole pixels for rendering
