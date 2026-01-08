# Canvas Grid Rendering

## Problem

CSS gradient-based grid has subpixel rendering artifacts:

- Lines appear/disappear during pan/zoom
- Fractional pixel sizes cause visual drift
- Complex layering of multiple gradients

See `docs/2026-01-08-vertical-grid-alignment.md` for detailed investigation.

## Proposed Solution

Replace CSS gradient grid with HTML Canvas for pixel-perfect rendering.

### Hybrid Approach

- **Canvas**: Grid background (lines, row fills)
- **HTML divs**: Notes (keep for easier interaction handling)
- **Layer order**: Canvas (behind) → Notes (in front)

### Grid Elements to Render

1. **Row fills** - Black key rows with darker background
2. **Row lines** - Horizontal line at each pitch boundary
3. **Octave lines** - Brighter line at B/C boundary
4. **Sub-beat lines** - Vertical lines at grid snap intervals
5. **Beat lines** - Vertical lines at each beat
6. **Bar lines** - Brighter vertical lines every 4 beats

### Implementation Steps

1. Add `<canvas ref={canvasRef}>` element in grid container
2. Size canvas to match viewport (handle resize)
3. Create `drawGrid()` function that:
   - Clears canvas
   - Calculates visible range (beats, pitches)
   - Draws each layer in order (back to front)
4. Call `drawGrid()` on:
   - Initial mount
   - Scroll (scrollX, scrollY change)
   - Zoom (pixelsPerBeat, pixelsPerKey change)
   - Resize (viewport size change)
   - Grid snap change
5. Use `requestAnimationFrame` for smooth updates during continuous pan/zoom

### Canvas Drawing Reference

```typescript
const ctx = canvas.getContext("2d");

// Line
ctx.strokeStyle = "#404040";
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.stroke();

// Filled rect (for black key rows)
ctx.fillStyle = "rgba(0,0,0,0.35)";
ctx.fillRect(x, y, width, height);
```

### Considerations

- Canvas resolution: Handle devicePixelRatio for sharp lines on retina
- Performance: Only draw visible lines, not entire grid
- Coordinate alignment: Use `Math.round()` or `+ 0.5` for crisp 1px lines

## Files

- `src/components/piano-roll.tsx` - Main implementation

## Status

**Pending** - Documented for future implementation
