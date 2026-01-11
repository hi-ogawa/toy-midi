# E2E Testing for Audio Output Verification

## Problem Context

Current E2E tests verify UI state (play/pause icons, button states) but don't verify that audio actually plays. The test named "MIDI plays from seeked position" only checks playhead SVG position - it doesn't verify audio output at all.

**Motivation:** We want confidence that Tone.js APIs are being used correctly and that audio actually comes out when expected.

**Goal:** Verify actual audio output - not what users hear, but that samples are produced.

## Testing Levels

| Level            | What it tests             | Current coverage |
| ---------------- | ------------------------- | ---------------- |
| UI state         | Icons, playhead position  | Existing tests   |
| Tone.js state    | Transport.state, .seconds | Not tested       |
| **Audio output** | Did samples come out?     | **Target**       |

## Research Summary

### Approach: Tone.js Waveform Analyser

Tone.js provides `Tone.Waveform` which wraps native `AnalyserNode`:

```typescript
const waveform = new Tone.Waveform(1024);
synth.connect(waveform);

// Get current samples as Float32Array (-1 to 1)
const samples = waveform.getValue();
// Silence = all values near 0
// Audio playing = values deviate from 0
```

**Key insight:** We can check if audio is "not silent" by verifying samples deviate from zero.

### Alternative: Raw AnalyserNode

Native Web Audio approach using `getByteTimeDomainData()`:

- Returns `Uint8Array` with values 0-255
- Silence = 127
- Audio = values deviate from 127

### References

- [Tone.Waveform docs](https://tonejs.github.io/docs/15.0.4/classes/Waveform.html) - `getValue()` returns Float32Array
- [Tone.Analyser docs](https://tonejs.github.io/docs/14.7.38/Analyser) - Can do FFT or waveform
- [MDN: AnalyserNode.getByteTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteTimeDomainData) - Native API
- [AudioWorklet recorder gist](https://gist.github.com/flpvsk/047140b31c968001dc563998f7440cc1) - More complex sample capture

## Implementation Plan

### Step 1: Add Waveform Analyser to AudioManager

**File:** `src/lib/audio.ts`

```typescript
class AudioManager {
  // ... existing fields ...

  // For testing - analyser connected to destination
  private analyser!: Tone.Waveform;

  async init(): Promise<void> {
    await Tone.start();

    // ... existing setup ...

    // Waveform analyser for testing audio output
    this.analyser = new Tone.Waveform(1024);
    // Connect all channels to analyser
    this.midiChannel.connect(this.analyser);
    this.audioChannel.connect(this.analyser);
    this.metronomeChannel.connect(this.analyser);
  }

  // For E2E testing - get current waveform samples
  getWaveformSamples(): Float32Array {
    return this.analyser.getValue() as Float32Array;
  }
}
```

### Step 2: Expose Debug Interface

**File:** `src/lib/audio.ts` (at bottom)

```typescript
// Expose for E2E testing
if (import.meta.env.DEV) {
  (window as any).__audioDebug = {
    getState: () => ({
      contextState: Tone.getContext().state,
      transportState: Tone.getTransport().state,
      position: Tone.getTransport().seconds,
      bpm: Tone.getTransport().bpm.value,
    }),
    getWaveform: () => audioManager.getWaveformSamples(),
    isAudioPlaying: () => {
      const samples = audioManager.getWaveformSamples();
      // Check if any sample deviates significantly from silence (0)
      const threshold = 0.01;
      return samples.some((s) => Math.abs(s) > threshold);
    },
  };
}
```

### Step 3: Create Test Helpers

**File:** `e2e/helpers.ts`

```typescript
import { Page, expect } from "@playwright/test";

export async function getAudioState(page: Page) {
  return page.evaluate(() => {
    const debug = (window as any).__audioDebug;
    if (!debug) throw new Error("__audioDebug not available");
    return debug.getState();
  });
}

export async function isAudioPlaying(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const debug = (window as any).__audioDebug;
    if (!debug) throw new Error("__audioDebug not available");
    return debug.isAudioPlaying();
  });
}

/**
 * Wait for audio to be detected (non-silent output).
 * Polls repeatedly since audio may take time to start.
 */
export async function expectAudioPlaying(page: Page, timeout = 2000) {
  await expect
    .poll(() => isAudioPlaying(page), {
      timeout,
      message: "Expected audio to be playing (non-silent)",
    })
    .toBe(true);
}

export async function expectAudioSilent(page: Page) {
  const playing = await isAudioPlaying(page);
  expect(playing).toBe(false);
}
```

### Step 4: Write Audio Output Tests

**File:** `e2e/audio-output.spec.ts` (new file)

```typescript
import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  expectAudioPlaying,
  expectAudioSilent,
  getAudioState,
} from "./helpers";

const BEAT_WIDTH = 80;

test.describe("Audio Output Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("metronome produces audio output when enabled and playing", async ({
    page,
  }) => {
    // Enable metronome
    await page.getByTestId("metronome-toggle").click();
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Should be silent before playback
    await expectAudioSilent(page);

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Should detect audio output (metronome clicks)
    await expectAudioPlaying(page);

    // Stop playback
    await page.getByTestId("play-pause-button").click();
  });

  test("MIDI note produces audio output", async ({ page }) => {
    // Create a note at beat 0
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Click near left edge to create note at beat 0
    await page.mouse.click(gridBox.x + 10, gridBox.y + 100);

    // Should be silent before playback
    await expectAudioSilent(page);

    // Start playback from beginning
    await page.getByTestId("play-pause-button").click();

    // Should detect MIDI synth audio
    await expectAudioPlaying(page);
  });

  test("no audio when playing empty project without metronome", async ({
    page,
  }) => {
    // Ensure metronome is off (default)
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Start playback (no notes, no metronome)
    await page.getByTestId("play-pause-button").click();

    // Wait a bit then verify silence
    await page.waitForTimeout(300);
    await expectAudioSilent(page);
  });

  test("MIDI note at beat 2 produces audio only after position passes it", async ({
    page,
  }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create note at beat 2
    const noteX = gridBox.x + BEAT_WIDTH * 2;
    await page.mouse.click(noteX, gridBox.y + 100);

    // Seek to beat 4 (past the note)
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    await page.mouse.click(
      timelineBox.x + BEAT_WIDTH * 4,
      timelineBox.y + timelineBox.height / 2,
    );

    // Start playback from beat 4
    await page.getByTestId("play-pause-button").click();

    // Wait - should be silent since we're past the note
    await page.waitForTimeout(500);
    await expectAudioSilent(page);
  });
});

test.describe("Transport State Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("audio context is running after init", async ({ page }) => {
    const state = await getAudioState(page);
    expect(state.contextState).toBe("running");
  });

  test("transport state reflects play/pause", async ({ page }) => {
    let state = await getAudioState(page);
    expect(state.transportState).toBe("stopped");

    await page.getByTestId("play-pause-button").click();
    state = await getAudioState(page);
    expect(state.transportState).toBe("started");

    await page.getByTestId("play-pause-button").click();
    state = await getAudioState(page);
    expect(state.transportState).toBe("paused");
  });

  test("transport position advances during playback", async ({ page }) => {
    await page.getByTestId("play-pause-button").click();

    await expect
      .poll(async () => (await getAudioState(page)).position, { timeout: 2000 })
      .toBeGreaterThan(0.1);
  });

  test("tempo change syncs to transport", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");
    await tempoInput.fill("180");
    await tempoInput.blur();

    const state = await getAudioState(page);
    expect(state.bpm).toBe(180);
  });
});
```

## Files to Modify/Create

| File                       | Change                                                      |
| -------------------------- | ----------------------------------------------------------- |
| `src/lib/audio.ts`         | Add `Tone.Waveform` analyser, expose `__audioDebug`         |
| `e2e/helpers.ts`           | Add `getAudioState`, `isAudioPlaying`, `expectAudioPlaying` |
| `e2e/audio-output.spec.ts` | New test file for audio verification                        |

## Key Test Scenarios

| Scenario                               | Expected                      |
| -------------------------------------- | ----------------------------- |
| Metronome on + playing                 | Audio detected                |
| MIDI note + playing from note position | Audio detected                |
| Empty project, no metronome, playing   | Silence                       |
| MIDI note at beat 2, play from beat 4  | Silence (note already passed) |

## Open Questions

1. **Threshold tuning:** What's the right threshold for "not silent"?
   - 0.01 seems reasonable but may need adjustment

2. **Timing sensitivity:** Audio output is timing-dependent
   - Using `expect.poll()` helps with flakiness
   - May need to adjust poll intervals

## Future Improvements

Beyond basic silence detection, potential follow-ups:

### 1. Frequency/Pitch Verification

Use `Tone.FFT` to verify the correct note is playing:

```typescript
const fft = new Tone.FFT(2048);
midiChannel.connect(fft);

// Get frequency bins
const spectrum = fft.getValue(); // Float32Array of dB values

// Find peak frequency
const peakIndex = spectrum.indexOf(Math.max(...spectrum));
const peakFreq = fft.getFrequencyOfIndex(peakIndex);

// Verify it matches expected MIDI note
const expectedFreq = Tone.Frequency(midiNote, "midi").toFrequency();
expect(peakFreq).toBeCloseTo(expectedFreq, 1);
```

**Use case:** Verify note preview plays correct pitch, or that transposition works.

### 2. Per-Channel Isolation

Add separate analysers per audio source:

```typescript
private midiAnalyser!: Tone.Waveform;
private metronomeAnalyser!: Tone.Waveform;
private audioAnalyser!: Tone.Waveform;

// In init():
this.midiAnalyser = new Tone.Waveform(1024);
this.midiChannel.connect(this.midiAnalyser);
// ... etc
```

**Use case:** Verify metronome is muted when disabled, while MIDI still plays.

### 3. Volume/Amplitude Verification

Check that volume sliders actually affect output level:

```typescript
function getRMSLevel(samples: Float32Array): number {
  const sum = samples.reduce((acc, s) => acc + s * s, 0);
  return Math.sqrt(sum / samples.length);
}

// Test: lowering volume reduces RMS
const before = getRMSLevel(getWaveform());
setVolume(0.5);
const after = getRMSLevel(getWaveform());
expect(after).toBeLessThan(before);
```

### 4. Timing Precision

Verify audio starts/stops at expected transport positions:

```typescript
// Record samples over time with timestamps
const recording: { time: number; hasAudio: boolean }[] = [];

// Poll during playback
while (transport.seconds < 4) {
  recording.push({
    time: transport.seconds,
    hasAudio: isAudioPlaying(),
  });
  await sleep(50);
}

// Verify note at beat 2 (1 second at 120bpm) triggered around t=1s
const firstAudio = recording.find((r) => r.hasAudio);
expect(firstAudio?.time).toBeCloseTo(1.0, 0.1);
```

### 5. Audio File Playback Verification

Verify loaded audio track produces output:

```typescript
test("loaded audio produces output when playing", async ({ page }) => {
  // Load audio file
  await page.getByTestId("audio-file-input").setInputFiles("test.wav");

  // Play from audio start position
  await page.getByTestId("play-pause-button").click();

  // Should detect audio from loaded track
  await expectAudioPlaying(page);
});
```

## Status

- [x] Research complete
- [ ] Awaiting user feedback on approach
- [ ] Implementation
- [ ] Tests passing
