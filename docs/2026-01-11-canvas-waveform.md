# Higher Resolution Waveform at Zoom (Canvas)

## Problem

Current waveform implementation uses SVG with downsampled peaks (max 500 points) for performance. This creates visual artifacts at high zoom levels:
- SVG path downsampling loses detail when zoomed in
- Fixed resolution doesn't adapt to zoom level
- Waveform appears blocky/pixelated at high zoom

## Current Implementation

### Peak Extraction (`audio.ts`)
```typescript
export function getAudioBufferPeaks(buffer, peaksPerSecond: 100)
  - Extracts peaks from audio buffer
  - Fixed resolution: 100 peaks per second
  - Stores in store.audioPeaks[]
```

### SVG Rendering (`piano-roll.tsx`)
```typescript
function Waveform({ peaks, height })
  - Downsamples peaks to max 500 points
  - Renders as single SVG path with viewBox scaling
  - preserveAspectRatio="none" stretches to fit
```

### Layout
- Waveform rendered inside WaveformArea (emerald green bar)
- Width scales with audio duration * pixelsPerBeat
- SVG viewBox coordinates (0-1000 for x)

## Solution: Canvas-based Dynamic Resolution

### Key Insight
Canvas allows pixel-level control and can render at viewport resolution:
- Render only visible portion of waveform
- Resolution adapts to zoom level (more detail when zoomed in)
- Direct access to full peak data (no downsampling)

### Approach

1. **Replace SVG with Canvas**
   - Canvas element inside WaveformArea
   - Size matches parent container (CSS)
   - Clear and redraw on viewport/zoom changes

2. **Viewport-aware Rendering**
   - Calculate visible audio time range based on scrollX and viewport width
   - Map audio time to peak indices
   - Render only visible peaks at current zoom level

3. **Dynamic Resolution**
   - At low zoom (zoomed out): aggregate multiple peaks per pixel
   - At high zoom (zoomed in): interpolate or show individual peaks
   - Resolution scales with pixelsPerBeat

4. **Optimization**
   - Use requestAnimationFrame for smooth rendering
   - Avoid unnecessary redraws (compare previous params)
   - Consider OffscreenCanvas for background rendering

## Implementation Plan

### Phase 1: Basic Canvas Replacement
1. Replace `<Waveform>` SVG component with canvas
2. Implement basic peak rendering (no downsampling)
3. Wire up to existing peak data

### Phase 2: Viewport-aware Rendering
1. Calculate visible audio range from scrollX/pixelsPerBeat
2. Render only visible portion of peaks
3. Update on scroll/zoom changes

### Phase 3: Dynamic Resolution
1. Calculate peaks-per-pixel ratio based on zoom
2. Aggregate peaks when zoomed out (max of range)
3. Show full detail when zoomed in

### Phase 4: Performance Optimization
1. Debounce/throttle redraw on rapid scroll
2. Memoize canvas context and drawing params
3. Profile and optimize hot paths

## Technical Details

### Canvas Size and Scaling
```typescript
// Canvas should match container size
const canvas = useRef<HTMLCanvasElement>(null);
const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

// Update on resize
useLayoutEffect(() => {
  const updateSize = () => {
    if (canvas.current) {
      const rect = canvas.current.getBoundingClientRect();
      canvas.current.width = rect.width;
      canvas.current.height = rect.height;
      setCanvasSize({ width: rect.width, height: rect.height });
    }
  };
  // ...
});
```

### Viewport Calculation
```typescript
// Audio region position in beats
const audioOffsetBeats = secondsToBeats(audioOffset, tempo);
const audioDurationBeats = secondsToBeats(audioDuration, tempo);

// Visible range in beats
const visibleStartBeat = scrollX;
const visibleEndBeat = scrollX + (viewportWidth / pixelsPerBeat);

// Intersection with audio region
const visibleAudioStart = Math.max(visibleStartBeat, audioOffsetBeats);
const visibleAudioEnd = Math.min(visibleEndBeat, audioOffsetBeats + audioDurationBeats);

// Convert to audio time (seconds)
const visibleAudioStartSec = beatsToSeconds(visibleAudioStart - audioOffsetBeats, tempo);
const visibleAudioEndSec = beatsToSeconds(visibleAudioEnd - audioOffsetBeats, tempo);

// Convert to peak indices
const startPeakIndex = Math.floor(visibleAudioStartSec * peaksPerSecond);
const endPeakIndex = Math.ceil(visibleAudioEndSec * peaksPerSecond);
```

### Peak Rendering
```typescript
const ctx = canvas.current.getContext('2d');
const centerY = height / 2;
const maxAmplitude = centerY * 0.9;

// Number of pixels available for waveform
const waveformWidthPixels = /* calculate based on visible audio duration */;
const visiblePeaks = audioPeaks.slice(startPeakIndex, endPeakIndex);
const peaksPerPixel = visiblePeaks.length / waveformWidthPixels;

// Clear canvas
ctx.clearRect(0, 0, width, height);

// Draw waveform
ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
ctx.lineWidth = 1;

if (peaksPerPixel > 1) {
  // Zoomed out: aggregate peaks
  for (let x = 0; x < waveformWidthPixels; x++) {
    const peakStart = Math.floor(x * peaksPerPixel);
    const peakEnd = Math.floor((x + 1) * peaksPerPixel);
    const maxPeak = Math.max(...visiblePeaks.slice(peakStart, peakEnd));
    const amplitude = maxPeak * maxAmplitude;
    
    // Draw vertical bar at x
    ctx.fillRect(x, centerY - amplitude, 1, amplitude * 2);
  }
} else {
  // Zoomed in: draw individual peaks (or interpolate)
  ctx.beginPath();
  for (let i = 0; i < visiblePeaks.length; i++) {
    const x = i / peaksPerPixel;
    const amplitude = visiblePeaks[i] * maxAmplitude;
    if (i === 0) {
      ctx.moveTo(x, centerY - amplitude);
    } else {
      ctx.lineTo(x, centerY - amplitude);
    }
  }
  // Mirror for bottom half
  for (let i = visiblePeaks.length - 1; i >= 0; i--) {
    const x = i / peaksPerPixel;
    const amplitude = visiblePeaks[i] * maxAmplitude;
    ctx.lineTo(x, centerY + amplitude);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/piano-roll.tsx` | Replace Waveform SVG component with canvas-based implementation |

## Testing Strategy

- Visual inspection at various zoom levels
- Verify smooth rendering during zoom/scroll
- Check performance with large audio files
- Manual testing (E2E tests for waveform are complex)

## Status

**Not started**

### TODO
- [ ] Implement canvas-based Waveform component
- [ ] Wire up viewport-aware rendering
- [ ] Test at various zoom levels
- [ ] Optimize performance

### Notes
- Keep existing peak extraction logic (getAudioBufferPeaks)
- May need higher peaksPerSecond in future for extreme zoom (currently 100)
- Consider caching rendered frames if performance issues
