// WASM + worklet from https://github.com/hi-ogawa/web-audio-worklet-rust
import * as Tone from "tone";

type ToneContext = ReturnType<typeof Tone.getContext>;

interface OxiSynthState {
  soundfonts: Array<{
    id: string;
    presets: Array<{
      id: string;
      name: string;
      bank: number;
      preset_num: number;
    }>;
  }>;
  current_preset: {
    id: string;
    soundfont_id: string;
    name: string;
    bank: number;
    preset_num: number;
  } | null;
}

const PROCESSOR_NAME = "oxisynth";

/**
 * OxiSynthSynth wraps the Rust/WASM OxiSynth-based AudioWorklet.
 * Uses simple postMessage for communication (no comlink dependency).
 */
export class OxiSynthSynth {
  private node!: AudioWorkletNode;
  private context: ToneContext;
  private currentSoundfontId: string | null = null;
  private pendingCallbacks = new Map<string, (data: unknown) => void>();

  readonly output: Tone.Gain;

  constructor(context: ToneContext) {
    this.context = context;
    this.output = new Tone.Gain({ context });
  }

  async init(options: { workletUrl: string; wasmUrl: string }): Promise<void> {
    // Load worklet module
    await this.context.addAudioWorkletModule(options.workletUrl);

    // Create worklet node
    this.node = this.context.createAudioWorkletNode(PROCESSOR_NAME, {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Connect to output
    Tone.connect(this.node, this.output);

    // Setup message handler
    this.node.port.onmessage = (e) => this.handleMessage(e.data);

    // Load and initialize WASM
    const wasmResponse = await fetch(options.wasmUrl);
    const wasmBuffer = await wasmResponse.arrayBuffer();

    await this.sendMessage("init", { wasmBytes: wasmBuffer }, "ready", [
      wasmBuffer,
    ]);
  }

  async addSoundFont(
    data: ArrayBuffer,
    name: string = "soundfont",
  ): Promise<void> {
    // Add soundfont to the synth
    await this.sendMessage("addSoundfont", { name, data }, "soundfontAdded", [
      data,
    ]);
    this.currentSoundfontId = name;

    // Select first preset from this soundfont
    const state = await this.getState();
    const sf = state.soundfonts.find((s) => s.id === name);
    if (!sf || sf.presets.length === 0) {
      throw new Error(`No presets found in soundfont: ${name}`);
    }
    this.postMessage({
      type: "setPreset",
      soundfontId: name,
      presetId: sf.presets[0].id,
    });
  }

  private async getState(): Promise<OxiSynthState> {
    const response = await this.sendMessage("getState", {}, "state");
    return (response as { state: OxiSynthState }).state;
  }

  /**
   * Change to a GM program (0-127).
   * Maps to bank 0, preset N.
   */
  async programChange(programNumber: number): Promise<void> {
    if (!this.currentSoundfontId) {
      throw new Error("No soundfont loaded");
    }

    const state = await this.getState();
    const sf = state.soundfonts.find((s) => s.id === this.currentSoundfontId);
    if (!sf) {
      throw new Error(`Soundfont not found: ${this.currentSoundfontId}`);
    }

    // Find preset matching bank 0, preset_num = programNumber
    const preset = sf.presets.find(
      (p) => p.bank === 0 && p.preset_num === programNumber,
    );
    if (!preset) {
      throw new Error(`Preset not found: bank=0, program=${programNumber}`);
    }
    this.postMessage({
      type: "setPreset",
      soundfontId: this.currentSoundfontId,
      presetId: preset.id,
    });
  }

  noteOn(noteNumber: number, velocity: number = 100): void {
    this.postMessage({ type: "noteOn", key: noteNumber, velocity });
  }

  noteOff(noteNumber: number): void {
    this.postMessage({ type: "noteOff", key: noteNumber });
  }

  /**
   * Trigger note on immediately and schedule note off after duration.
   * Uses audio-frame accurate timing in the worklet.
   * Note: Use scheduleNoteOnOff() for sequenced playback to ensure proper
   * ordering of note-off/note-on for adjacent same-pitch notes.
   */
  triggerAttackRelease(
    noteNumber: number,
    duration: number,
    velocity = 100,
  ): void {
    const durationSamples = Math.round(duration * this.context.sampleRate);
    this.postMessage({
      type: "noteOnOff",
      key: noteNumber,
      velocity,
      durationSamples,
    });
  }

  /**
   * Schedule note-on and note-off at absolute audio context times.
   * Both times are converted to absolute frames, ensuring that adjacent
   * same-pitch notes share the exact same frame boundary (no float drift).
   * The worklet processes note-offs before note-ons at the same frame.
   */
  scheduleNoteOnOff(
    noteNumber: number,
    startTime: number,
    endTime: number,
    velocity = 100,
  ): void {
    const startFrame = Math.round(startTime * this.context.sampleRate);
    const endFrame = Math.round(endTime * this.context.sampleRate);
    this.postMessage({
      type: "scheduleNoteOnOff",
      key: noteNumber,
      velocity,
      startFrame,
      endFrame,
    });
  }

  allNotesOff(): void {
    for (let note = 0; note < 128; note++) {
      this.noteOff(note);
    }
  }

  private postMessage(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
  ): void {
    this.node.port.postMessage(msg, transfer ?? []);
  }

  private sendMessage(
    type: string,
    data: Record<string, unknown>,
    responseType: string,
    transfer?: Transferable[],
  ): Promise<unknown> {
    return new Promise((resolve) => {
      this.pendingCallbacks.set(responseType, resolve);
      this.postMessage({ type, ...data }, transfer);
    });
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    const callback = this.pendingCallbacks.get(msg.type);
    if (callback) {
      this.pendingCallbacks.delete(msg.type);
      callback(msg);
    }
  }
}
