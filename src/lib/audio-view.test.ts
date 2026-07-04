import { describe, expect, it } from "vitest";
import {
  type AudioView,
  type AudioViewSlice,
  createAudioView,
  EMPTY_AUDIO_VIEW,
  queryAudioView,
} from "./audio-view";

describe("createAudioView", () => {
  it("extracts peak values from audio samples", () => {
    // 1 second of audio at 100 Hz sample rate, extract at 10 points/sec
    // Each point covers 10 samples
    const samples = new Float32Array([
      // Point 0: samples 0-9, max = 0.5
      0.1, 0.2, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0,
      // Point 1: samples 10-19, max = 0.8
      0.0, 0.2, 0.4, 0.6, 0.8, 0.6, 0.4, 0.2, 0.0, 0.0,
      // Point 2: samples 20-29, max = 0.3
      0.1, 0.2, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0,
    ]);

    const view = createAudioView(samples, 100, 10);

    expect(view.data).toHaveLength(3);
    expect(view.data[0]).toBeCloseTo(0.5);
    expect(view.data[1]).toBeCloseTo(0.8);
    expect(view.data[2]).toBeCloseTo(0.3);
    expect(view.samplesPerPoint).toBe(10);
    expect(view.sampleRate).toBe(100);
  });

  it("handles negative sample values (takes absolute)", () => {
    const samples = new Float32Array([
      -0.9,
      0.1,
      0.2,
      0.3,
      0.4, // Max should be 0.9
    ]);

    const view = createAudioView(samples, 100, 20); // 5 samples per point

    expect(view.data).toHaveLength(1);
    expect(view.data[0]).toBeCloseTo(0.9);
  });

  it("returns EMPTY_AUDIO_VIEW for empty samples", () => {
    const samples = new Float32Array([]);
    const view = createAudioView(samples, 44100, 100);
    expect(view).toEqual(EMPTY_AUDIO_VIEW);
  });

  it("returns EMPTY_AUDIO_VIEW for zero pointsPerSecond", () => {
    const samples = new Float32Array([0.5, 0.5, 0.5]);
    const view = createAudioView(samples, 44100, 0);
    expect(view).toEqual(EMPTY_AUDIO_VIEW);
  });

  it("returns EMPTY_AUDIO_VIEW for negative pointsPerSecond", () => {
    const samples = new Float32Array([0.5, 0.5, 0.5]);
    const view = createAudioView(samples, 44100, -10);
    expect(view).toEqual(EMPTY_AUDIO_VIEW);
  });

  it("handles partial final chunk", () => {
    // 25 samples at 100 Hz, 10 points/sec = 10 samples per point
    // Should produce 3 points (0-9, 10-19, 20-24)
    const samples = new Float32Array(25).fill(0.5);
    samples[22] = 0.9; // Set a peak in the partial final chunk

    const view = createAudioView(samples, 100, 10);

    expect(view.data).toHaveLength(3);
    expect(view.data[2]).toBeCloseTo(0.9);
  });

  it("produces correct number of points for typical audio", () => {
    // 3 seconds of audio at 44100 Hz, extract at 800 points/sec
    const duration = 3;
    const sampleRate = 44100;
    const pointsPerSecond = 800;
    const samples = new Float32Array(duration * sampleRate).fill(0.1);

    const view = createAudioView(samples, sampleRate, pointsPerSecond);

    // Due to integer division of samplesPerPoint, actual count can vary
    // samplesPerPoint = floor(44100/800) = 55, so we get ceil(132300/55) = 2406 points
    const samplesPerPoint = Math.floor(sampleRate / pointsPerSecond);
    const expectedPoints = Math.ceil(samples.length / samplesPerPoint);
    expect(view.data.length).toBe(expectedPoints);
  });
});

describe("queryAudioView", () => {
  // Create test view: 100 points at 10 points/sec = 10 seconds of audio
  const createTestView = (count: number): AudioView => ({
    data: Array.from({ length: count }, (_, i) => (i + 1) / count),
    samplesPerPoint: 100, // 1000 Hz / 10 points/sec
    sampleRate: 1000,
  });

  const emptySlice: AudioViewSlice = { data: [], actualStart: 0, actualEnd: 0 };

  it("returns empty slice for empty data", () => {
    const result = queryAudioView(EMPTY_AUDIO_VIEW, 0, 5, 500);
    expect(result).toEqual(emptySlice);
  });

  it("returns empty slice for zero target points", () => {
    const view = createTestView(100);
    const result = queryAudioView(view, 0, 5, 0);
    expect(result).toEqual(emptySlice);
  });

  it("returns empty slice for negative target points", () => {
    const view = createTestView(100);
    const result = queryAudioView(view, 0, 5, -100);
    expect(result).toEqual(emptySlice);
  });

  it("slices to visible range and returns actual bounds", () => {
    // 100 points at 10 points/sec = 10 seconds
    // View seconds 2-4 (indices 20-40)
    const view = createTestView(100);
    const result = queryAudioView(view, 2, 4, 1000); // Large targetPoints to avoid downsampling

    // Should get ~20 points (indices 20-40)
    expect(result.data.length).toBeGreaterThanOrEqual(19);
    expect(result.data.length).toBeLessThanOrEqual(21);

    // First point should be around index 20 value
    expect(result.data[0]).toBeCloseTo(view.data[20], 1);

    // Actual bounds should be aligned to data boundaries
    expect(result.actualStart).toBeCloseTo(2, 1);
    expect(result.actualEnd).toBeCloseTo(4, 1);
  });

  it("clamps start index to 0 for negative startTime", () => {
    const view = createTestView(100);
    const result = queryAudioView(view, -5, 2, 1000);

    // Should start from index 0
    expect(result.data[0]).toBeCloseTo(view.data[0], 1);
    expect(result.actualStart).toBe(0);
  });

  it("clamps end index to data length", () => {
    const view = createTestView(100);
    // 100 points at 10/sec = 10 seconds, view 8-15 (beyond end)
    const result = queryAudioView(view, 8, 15, 1000);

    // Should get points from index 80 to 99
    expect(result.data.length).toBe(20);
    expect(result.data[result.data.length - 1]).toBeCloseTo(view.data[99], 1);
    expect(result.actualEnd).toBe(10); // Clamped to audio duration
  });

  it("returns points as-is when fewer than target", () => {
    const view: AudioView = {
      data: [0.1, 0.2, 0.3, 0.4, 0.5],
      samplesPerPoint: 100,
      sampleRate: 1000,
    };
    // 5 points, 1000 target points - no downsampling needed
    const result = queryAudioView(view, 0, 0.5, 1000);

    expect(result.data).toEqual(view.data);
    expect(result.actualStart).toBe(0);
    expect(result.actualEnd).toBe(0.5);
  });

  it("downsamples to target points when more points than targets", () => {
    // 1000 points, view all, downsample to 100 pixels
    const view = createTestView(1000);
    const result = queryAudioView(view, 0, 100, 100);

    expect(result.data).toHaveLength(100);
  });

  it("preserves max values when downsampling", () => {
    // 100 points with a spike at index 50
    const data = new Array(100).fill(0.1);
    data[50] = 1.0;
    const view: AudioView = { data, samplesPerPoint: 100, sampleRate: 1000 };

    // Downsample to 10 pixels (10 points per pixel)
    // Spike at index 50 should appear in pixel 5
    const result = queryAudioView(view, 0, 10, 10);

    expect(result.data).toHaveLength(10);
    expect(result.data[5]).toBe(1.0); // Max preserved
    expect(result.data[0]).toBe(0.1); // No spike here
  });

  it("handles query starting partway through audio", () => {
    // 100 points at 10 points/sec = 10 seconds
    // Query starts at second 3
    const view = createTestView(100);
    const result = queryAudioView(view, 3, 5, 500);

    // Should get points from index 30-50
    expect(result.data.length).toBeGreaterThanOrEqual(19);
    expect(result.data[0]).toBeCloseTo(view.data[30], 1);
    expect(result.actualStart).toBeCloseTo(3, 1);
  });

  it("handles empty visible range (endTime <= startTime)", () => {
    const view = createTestView(100);
    const result = queryAudioView(view, 5, 5, 100);

    // startIdx = 50, endIdx = 50, slice is empty
    expect(result).toEqual(emptySlice);
  });

  it("handles visible range entirely before audio", () => {
    const view = createTestView(100);
    // Visible range -5 to -2 seconds (before audio starts)
    const result = queryAudioView(view, -5, -2, 100);

    // startIdx clamped to 0, endIdx = 0, slice is empty
    expect(result).toEqual(emptySlice);
  });

  it("handles visible range entirely after audio", () => {
    const view = createTestView(100); // 10 seconds
    // Visible range 15-20 seconds (after audio ends)
    const result = queryAudioView(view, 15, 20, 100);

    // startIdx = 150, endIdx = 200, both beyond length, slice is empty
    expect(result).toEqual(emptySlice);
  });

  it("scroll stability: adjacent queries have consistent overlapping data", () => {
    // Simulate realistic scenario: 3 min audio at 800 pts/sec
    // Viewport showing ~2 seconds, rendered to 200 pixels
    const pointsPerSec = 800;
    const duration = 180; // 3 minutes
    const viewportDuration = 2; // 2 seconds visible
    const targetPoints = 200; // pixels

    // Create view with distinct values so we can detect changes
    const view: AudioView = {
      data: Array.from(
        { length: duration * pointsPerSec },
        (_, i) => (i % 100) / 100,
      ),
      samplesPerPoint: 60, // 48000 / 800
      sampleRate: 48000,
    };

    // Query at different scroll positions (small increments)
    const results: { data: number[] }[] = [];
    for (let scrollSec = 30; scrollSec < 30.1; scrollSec += 0.01) {
      const result = queryAudioView(
        view,
        scrollSec,
        scrollSec + viewportDuration,
        targetPoints,
      );
      results.push({ data: result.data });
    }

    // Verify: adjacent queries should have consistent overlapping data
    // When data shifts by 1, current[1] should equal next[0]
    let shiftsMatch = 0;
    for (let i = 0; i < results.length - 1; i++) {
      const curr = results[i].data;
      const next = results[i + 1].data;
      // Check if first element of next matches second element of curr
      if (Math.abs(next[0] - curr[1]) < 0.0001) {
        shiftsMatch++;
      }
    }

    // With stable grid alignment, most adjacent shifts should match
    expect(shiftsMatch).toBeGreaterThanOrEqual(results.length - 2);
  });
});
