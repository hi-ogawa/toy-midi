import type { Note } from "../types";

/**
 * Demo project data for testing and onboarding.
 * Contains a simple bass line pattern.
 */
export interface DemoProjectData {
  notes: Note[];
  tempo: number;
  audioFileName: string | null;
  audioUrl: string | null;
}

/**
 * Simple two-bar bass line pattern in E minor.
 * Pattern: E2 - E2 - G2 - B2 (repeated)
 */
export const DEMO_PROJECT: DemoProjectData = {
  notes: [
    // Bar 1
    { id: "demo-1", pitch: 40, start: 0, duration: 1, velocity: 100 }, // E2
    { id: "demo-2", pitch: 40, start: 1, duration: 1, velocity: 90 }, // E2
    { id: "demo-3", pitch: 43, start: 2, duration: 1, velocity: 95 }, // G2
    { id: "demo-4", pitch: 47, start: 3, duration: 1, velocity: 100 }, // B2
    // Bar 2
    { id: "demo-5", pitch: 40, start: 4, duration: 1, velocity: 100 }, // E2
    { id: "demo-6", pitch: 40, start: 5, duration: 1, velocity: 90 }, // E2
    { id: "demo-7", pitch: 43, start: 6, duration: 1, velocity: 95 }, // G2
    { id: "demo-8", pitch: 47, start: 7, duration: 1, velocity: 100 }, // B2
  ],
  tempo: 120,
  audioFileName: "test-audio.wav",
  audioUrl: "/test-audio.wav",
};
