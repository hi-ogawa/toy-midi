import { getSampleEventsFromSoundFont, type SynthEvent } from "@ryohey/wavelet";
import * as Tone from "tone";

/**
 * SoundFontSynth wraps @ryohey/wavelet to provide SF2-based synthesis.
 * Uses native AudioContext (like Signal) for proper envelope behavior.
 * Connects to Tone.js audio graph via MediaStreamDestination bridge.
 */
export class SoundFontSynth {
  private synth: AudioWorkletNode | null = null;
  private context: AudioContext;
  private isSetup = false;
  private sequenceNumber = 0;
  private _isLoaded = false;

  /** Tone.js-compatible output node for connecting to other Tone nodes */
  readonly output: Tone.Gain;

  constructor() {
    // Use native AudioContext like Signal does
    this.context = new AudioContext();
    // Create Tone.js output node for integration with Tone.js audio graph
    this.output = new Tone.Gain();
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get sampleRate(): number {
    return this.context.sampleRate;
  }

  /**
   * Initialize the AudioWorklet processor.
   * Must be called before loadSoundFont.
   */
  async setup(): Promise<void> {
    if (this.isSetup) return;

    const url = new URL(
      "@ryohey/wavelet/dist/processor.js",
      import.meta.url,
    ).toString();
    // Use native audioWorklet.addModule like Signal
    await this.context.audioWorklet.addModule(url);
    this.isSetup = true;
  }

  /**
   * Load a soundfont from a URL and initialize the synth.
   */
  async loadSoundFontFromURL(url: string): Promise<void> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    await this.loadSoundFont(data);
  }

  /**
   * Load a soundfont from ArrayBuffer data.
   */
  async loadSoundFont(data: ArrayBuffer): Promise<void> {
    if (!this.isSetup) {
      throw new Error("SoundFontSynth.setup() must be called before loading");
    }

    // Disconnect existing synth if any
    if (this.synth) {
      this.synth.disconnect();
    }

    // Create new synth worklet node using native AudioWorkletNode like Signal
    this.synth = new AudioWorkletNode(this.context, "synth-processor", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    this.sequenceNumber = 0;

    // Bridge native AudioContext to Tone.js:
    // Create a MediaStreamDestination to capture audio from native context
    const streamDest = this.context.createMediaStreamDestination();
    this.synth.connect(streamDest);

    // Create a MediaStreamSource in Tone.js context to receive the stream
    const toneContext = Tone.getContext();
    const streamSource = toneContext.createMediaStreamSource(streamDest.stream);
    Tone.connect(streamSource, this.output);

    // Parse soundfont and extract sample events
    const sampleEvents = getSampleEventsFromSoundFont(new Uint8Array(data));

    // Send sample data to the worklet
    for (const e of sampleEvents) {
      this.postMessage(e.event, e.transfer);
    }

    this._isLoaded = true;
  }

  /**
   * Trigger a note on event.
   * @param noteNumber MIDI note number (0-127)
   * @param velocity Note velocity (0-127)
   * @param channel MIDI channel (0-15, default 0)
   * @param delayTime Delay in seconds from now
   */
  noteOn(
    noteNumber: number,
    velocity: number = 100,
    channel: number = 0,
    delayTime: number = 0,
  ): void {
    this.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOn",
        channel,
        noteNumber,
        velocity,
      },
      delayTime: delayTime * this.context.sampleRate,
    });
  }

  /**
   * Trigger a note off event.
   * @param noteNumber MIDI note number (0-127)
   * @param channel MIDI channel (0-15, default 0)
   * @param delayTime Delay in seconds from now
   */
  noteOff(
    noteNumber: number,
    channel: number = 0,
    delayTime: number = 0,
  ): void {
    this.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOff",
        channel,
        noteNumber,
        velocity: 0,
      },
      delayTime: delayTime * this.context.sampleRate,
    });
  }

  /**
   * Send a program change to select an instrument preset.
   * @param programNumber GM program number (0-127)
   * @param channel MIDI channel (0-15, default 0)
   */
  programChange(programNumber: number, channel: number = 0): void {
    this.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "programChange",
        channel,
        value: programNumber,
      },
      delayTime: 0,
    });
  }

  /**
   * Stop all playing notes immediately.
   */
  allNotesOff(): void {
    // Send all notes off on all channels
    for (let channel = 0; channel < 16; channel++) {
      this.postMessage({
        type: "midi",
        midi: {
          type: "channel",
          subtype: "controller",
          channel,
          controllerType: 123, // All Notes Off
          value: 0,
        },
        delayTime: 0,
      });
    }
  }

  dispose(): void {
    this.synth?.disconnect();
    this.output.dispose();
  }

  private postMessage(event: SynthEvent, transfer?: Transferable[]): void {
    this.synth?.port.postMessage(
      { ...event, sequenceNumber: this.sequenceNumber++ },
      transfer ?? [],
    );
  }
}
