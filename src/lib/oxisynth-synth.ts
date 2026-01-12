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
  private node: AudioWorkletNode | null = null;
  private context: ToneContext;
  private isSetup = false;
  private _isLoaded = false;
  private currentSoundfontId: string | null = null;
  private pendingCallbacks = new Map<string, (data: unknown) => void>();

  readonly output: Tone.Gain;

  constructor(context: ToneContext) {
    this.context = context;
    this.output = new Tone.Gain({ context });
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  async setup(): Promise<void> {
    if (this.isSetup) return;

    // Load worklet module
    await this.context.addAudioWorkletModule("/oxisynth/worklet.js");

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
    const wasmResponse = await fetch("/oxisynth/oxisynth.wasm");
    const wasmBuffer = await wasmResponse.arrayBuffer();

    await this.sendMessage("init", { wasmBytes: wasmBuffer }, "ready", [
      wasmBuffer,
    ]);

    this.isSetup = true;
  }

  async loadSoundFontFromURL(url: string): Promise<void> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    await this.loadSoundFont(data, url);
  }

  async loadSoundFont(
    data: ArrayBuffer,
    name: string = "soundfont",
  ): Promise<void> {
    if (!this.node) {
      throw new Error("OxiSynthSynth.setup() must be called first");
    }

    // Add soundfont to the synth
    await this.sendMessage("addSoundfont", { name, data }, "soundfontAdded", [
      data,
    ]);
    this.currentSoundfontId = name;

    // Select first preset from this soundfont
    const state = await this.getState();
    const sf = state?.soundfonts.find((s) => s.id === name);
    if (sf && sf.presets.length > 0) {
      this.postMessage({
        type: "setPreset",
        soundfontId: name,
        presetId: sf.presets[0].id,
      });
    }

    this._isLoaded = true;
  }

  async getState(): Promise<OxiSynthState | null> {
    if (!this.node) return null;
    const response = await this.sendMessage("getState", {}, "state");
    return (response as { state: OxiSynthState }).state;
  }

  /**
   * Change to a GM program (0-127).
   * Maps to bank 0, preset N.
   */
  async programChange(programNumber: number): Promise<void> {
    if (!this.node || !this.currentSoundfontId) return;

    const state = await this.getState();
    const sf = state?.soundfonts.find((s) => s.id === this.currentSoundfontId);
    if (!sf) return;

    // Find preset matching bank 0, preset_num = programNumber
    const preset = sf.presets.find(
      (p) => p.bank === 0 && p.preset_num === programNumber,
    );
    if (preset) {
      this.postMessage({
        type: "setPreset",
        soundfontId: this.currentSoundfontId,
        presetId: preset.id,
      });
    }
  }

  noteOn(noteNumber: number, velocity: number = 100): void {
    this.postMessage({ type: "noteOn", key: noteNumber, velocity });
  }

  noteOff(noteNumber: number): void {
    this.postMessage({ type: "noteOff", key: noteNumber });
  }

  allNotesOff(): void {
    // Send note off for all possible notes
    for (let note = 0; note < 128; note++) {
      this.postMessage({ type: "noteOff", key: note });
    }
  }

  dispose(): void {
    this.node?.disconnect();
    this.output.dispose();
  }

  private postMessage(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
  ): void {
    this.node?.port.postMessage(msg, transfer ?? []);
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
