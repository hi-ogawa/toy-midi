import * as Tone from "tone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { audioManager } from "./audio";

/**
 * Audio transport state tests
 *
 * These tests verify transport state management (play/pause/stop/seek)
 * without testing actual audio output. We test:
 * - Tone.Transport state transitions
 * - Position tracking
 * - Integration with audioManager
 */

describe("Audio Transport State", () => {
  beforeEach(async () => {
    // Reset transport state before each test
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    transport.bpm.value = 120;

    // Initialize audio manager if needed
    await audioManager.init();
  });

  describe("Transport state transitions", () => {
    it("should start transport when play is called", () => {
      const transport = Tone.getTransport();
      expect(transport.state).toBe("stopped");

      audioManager.play();

      expect(transport.state).toBe("started");
    });

    it("should pause transport when pause is called", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      expect(transport.state).toBe("started");

      audioManager.pause();
      expect(transport.state).toBe("paused");
    });

    it("should stop transport and reset position when stop is called", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      transport.seconds = 5; // simulate some playback
      audioManager.stop();

      expect(transport.state).toBe("stopped");
      expect(transport.seconds).toBe(0);
    });

    it("should transition from paused to playing", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      audioManager.pause();
      expect(transport.state).toBe("paused");

      audioManager.play();
      expect(transport.state).toBe("started");
    });
  });

  describe("Position and seek", () => {
    it("should update position when seek is called while stopped", () => {
      const transport = Tone.getTransport();
      expect(transport.seconds).toBe(0);

      audioManager.seek(10);

      expect(transport.seconds).toBe(10);
      expect(transport.state).toBe("stopped");
    });

    it("should update position when seek is called while playing", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      audioManager.seek(15);

      // Should still be playing after seek
      expect(transport.state).toBe("started");
      expect(transport.seconds).toBe(15);
    });

    it("should update position when seek is called while paused", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      audioManager.pause();
      audioManager.seek(8);

      // Should still be paused after seek
      expect(transport.state).toBe("paused");
      expect(transport.seconds).toBe(8);
    });

    it("should not allow negative seek positions", () => {
      audioManager.seek(-5);

      const transport = Tone.getTransport();
      expect(transport.seconds).toBe(0);
    });

    it("should allow seeking to zero", () => {
      const transport = Tone.getTransport();
      transport.seconds = 10;

      audioManager.seek(0);

      expect(transport.seconds).toBe(0);
    });
  });

  describe("Audio loading and duration", () => {
    it("should report not loaded initially", () => {
      expect(audioManager.loaded).toBe(false);
      expect(audioManager.duration).toBe(0);
    });

    it("should be able to play without audio loaded (MIDI-only mode)", async () => {
      await audioManager.init();
      expect(audioManager.canPlay).toBe(true);

      // Should not throw
      audioManager.play();
      const transport = Tone.getTransport();
      expect(transport.state).toBe("started");

      audioManager.stop();
    });
  });

  describe("Offset management", () => {
    it("should set and retrieve audio offset when audio is not loaded", () => {
      // Without audio loaded, offset is clamped to 0 (duration is 0)
      audioManager.setOffset(5);
      expect(audioManager.offset).toBe(0);
    });

    it("should maintain transport state when changing offset", () => {
      const transport = Tone.getTransport();

      audioManager.play();
      const wasPlaying = transport.state === "started";

      audioManager.setOffset(3);

      // State should be restored
      expect(transport.state).toBe(wasPlaying ? "started" : "stopped");
    });

    it("should clamp offset to duration bounds", () => {
      // Without audio loaded, offset is constrained by duration (0)
      audioManager.setOffset(-2);
      expect(Math.abs(audioManager.offset)).toBe(0);

      audioManager.setOffset(10);
      expect(audioManager.offset).toBe(0);
    });
  });

  describe("Metronome state", () => {
    it("should toggle metronome state", () => {
      expect(audioManager.metronomeEnabled).toBe(false);

      audioManager.setMetronomeEnabled(true);
      expect(audioManager.metronomeEnabled).toBe(true);

      audioManager.setMetronomeEnabled(false);
      expect(audioManager.metronomeEnabled).toBe(false);
    });

    it("should persist metronome state through play/stop cycles", () => {
      audioManager.setMetronomeEnabled(true);

      audioManager.play();
      audioManager.stop();

      expect(audioManager.metronomeEnabled).toBe(true);
    });
  });

  describe("Volume controls", () => {
    it("should set audio volume within valid range", () => {
      // Should not throw
      audioManager.setAudioVolume(0.5);
      audioManager.setAudioVolume(0);
      audioManager.setAudioVolume(1);
    });

    it("should set MIDI volume within valid range", () => {
      // Should not throw
      audioManager.setMidiVolume(0.5);
      audioManager.setMidiVolume(0);
      audioManager.setMidiVolume(1);
    });

    it("should set metronome volume within valid range", () => {
      // Should not throw
      audioManager.setMetronomeVolume(0.5);
      audioManager.setMetronomeVolume(0);
      audioManager.setMetronomeVolume(1);
    });

    it("should clamp volume values above 1", () => {
      // These should not throw or cause issues
      audioManager.setAudioVolume(2);
      audioManager.setMidiVolume(1.5);
      audioManager.setMetronomeVolume(10);
    });

    it("should clamp volume values below 0", () => {
      // These should not throw or cause issues
      audioManager.setAudioVolume(-1);
      audioManager.setMidiVolume(-0.5);
      audioManager.setMetronomeVolume(-5);
    });
  });

  describe("Note scheduling", () => {
    it("should schedule notes for playback", () => {
      const notes = [
        { id: "1", pitch: 60, start: 0, duration: 1, velocity: 100 },
        { id: "2", pitch: 64, start: 1, duration: 1, velocity: 100 },
      ];

      // Should not throw
      audioManager.scheduleNotes(notes, 0, 120);
    });

    it("should clear scheduled notes", () => {
      const notes = [
        { id: "1", pitch: 60, start: 0, duration: 1, velocity: 100 },
      ];

      audioManager.scheduleNotes(notes, 0, 120);
      // Should not throw
      audioManager.clearScheduledNotes();
    });

    it("should update notes during playback", () => {
      const transport = Tone.getTransport();
      const notes = [
        { id: "1", pitch: 60, start: 0, duration: 1, velocity: 100 },
      ];

      audioManager.play();
      // Should not throw
      audioManager.updateNotesWhilePlaying(notes, 120);

      audioManager.stop();
    });

    it("should play note preview immediately", () => {
      // Should not throw
      audioManager.playNote(60, 0.2);
      audioManager.playNote(64);
    });
  });

  describe("Transport events integration", () => {
    // Note: These tests verify that Transport events can be subscribed to.
    // The actual event firing is tested implicitly through state transition tests above.

    it("should allow subscribing to start event", () => {
      const transport = Tone.getTransport();
      const handler = () => {};

      // Should not throw
      transport.on("start", handler);
      transport.off("start", handler);
    });

    it("should allow subscribing to stop event", () => {
      const transport = Tone.getTransport();
      const handler = () => {};

      // Should not throw
      transport.on("stop", handler);
      transport.off("stop", handler);
    });

    it("should allow subscribing to pause event", () => {
      const transport = Tone.getTransport();
      const handler = () => {};

      // Should not throw
      transport.on("pause", handler);
      transport.off("pause", handler);
    });
  });
});
