import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addSoundFontMock = vi.fn<(...args: unknown[]) => Promise<void>>();
const noteOnMock = vi.fn<(note: number, velocity?: number) => void>();
const noteOffMock = vi.fn<(note: number) => void>();
const scheduleNoteOnOffMock =
  vi.fn<
    (note: number, start: number, end: number, velocity?: number) => void
  >();
const allNotesOffMock = vi.fn<() => void>();
const triggerAttackReleaseMock =
  vi.fn<(note: number, duration: number, velocity?: number) => void>();
const programChangeMock = vi.fn<(program: number) => Promise<void>>();

const transport = {
  bpm: { value: 120 },
  on: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  seconds: 0,
};

vi.mock("tone", () => {
  class Channel {
    volume = { rampTo: vi.fn() };
    mute = false;
    constructor(_volume?: number) {}
    toDestination() {
      return this;
    }
    connect(_destination: unknown) {}
  }

  class Part<T> {
    constructor(
      _callback: (time: number, value: T) => void,
      _events: Array<unknown>,
    ) {}
    start(_time: number) {
      return this;
    }
    clear() {}
    add(_time: string, _event: unknown) {}
  }

  class Player {
    loaded = false;
    buffer = {};
    connect(_destination: unknown) {}
    stop() {}
    sync() {
      return this;
    }
    unsync() {
      return this;
    }
    start(_time: number) {
      return this;
    }
  }

  class Synth {
    constructor(_options?: unknown) {}
    connect(_destination: unknown) {}
    triggerAttackRelease(_note: string, _duration: string, _time: number) {}
  }

  class Sequence {
    events: string[] = [];
    constructor(
      _callback: (time: number, note: string) => void,
      _events: string[],
      _subdivision: string,
    ) {}
    start(_time: number) {
      return this;
    }
    clear() {}
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({ sampleRate: 48000 })),
    getTransport: vi.fn(() => transport),
    Channel,
    Part,
    Player,
    Synth,
    Sequence,
    gainToDb: vi.fn((gain: number) => gain),
    ToneAudioBuffer: class {},
  };
});

vi.mock("./oxisynth-synth", () => ({
  OxiSynthSynth: class {
    output = { connect: vi.fn() };
    constructor(_context: unknown) {}
    init = vi.fn().mockResolvedValue(undefined);
    addSoundFont = addSoundFontMock.mockResolvedValue(undefined);
    noteOn = noteOnMock;
    noteOff = noteOffMock;
    scheduleNoteOnOff = scheduleNoteOnOffMock;
    allNotesOff = allNotesOffMock;
    triggerAttackRelease = triggerAttackReleaseMock;
    programChange = programChangeMock.mockResolvedValue(undefined);
  },
}));

describe("audioManager.init", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-warms OxiSynth voice allocation after soundfont load", async () => {
    const { audioManager } = await import("./audio");

    await audioManager.init();

    expect(addSoundFontMock).toHaveBeenCalledOnce();
    expect(noteOnMock).toHaveBeenCalledWith(60, 1);
    expect(noteOffMock).toHaveBeenCalledWith(60);
    expect(addSoundFontMock.mock.invocationCallOrder[0]).toBeLessThan(
      noteOnMock.mock.invocationCallOrder[0],
    );
  });
});
