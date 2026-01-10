import { getSampleEventsFromSoundFont } from "@ryohey/wavelet";

export interface SoundFontSynthOptions {
  url: string;
  context: AudioContext;
  destination: AudioNode;
}

export class SoundFontSynth {
  private synth: AudioWorkletNode | null = null;
  private sequenceNumber = 0;
  private _loaded = false;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  get loaded(): boolean {
    return this._loaded;
  }

  async setup(): Promise<void> {
    const url = new URL("@ryohey/wavelet/dist/processor.js", import.meta.url);
    await this.context.audioWorklet.addModule(url);
  }

  async loadSoundFont(url: string): Promise<void> {
    // Fetch SF2 file
    const response = await fetch(url);
    const data = await response.arrayBuffer();

    // Parse soundfont
    const sampleEvents = getSampleEventsFromSoundFont(new Uint8Array(data));

    // Disconnect old synth if exists
    if (this.synth) {
      this.synth.disconnect();
    }

    // Create new AudioWorkletNode
    this.synth = new AudioWorkletNode(this.context, "synth-processor", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    this.synth.connect(this.destination);
    this.sequenceNumber = 0;

    // Send sample data to worklet
    for (const e of sampleEvents) {
      this.postMessage(e.event, e.transfer);
    }

    this._loaded = true;
  }

  private postMessage(
    event: Parameters<typeof getSampleEventsFromSoundFont>[0] extends Uint8Array
      ? ReturnType<typeof getSampleEventsFromSoundFont>[number]["event"]
      : never,
    transfer?: Transferable[],
  ): void {
    this.synth?.port.postMessage(
      { ...event, sequenceNumber: this.sequenceNumber++ },
      transfer ?? [],
    );
  }

  noteOn(
    noteNumber: number,
    velocity: number = 100,
    channel: number = 0,
    delayTime: number = 0,
  ): void {
    if (!this.synth) return;
    this.synth.port.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOn",
        channel,
        noteNumber,
        velocity,
      },
      delayTime: delayTime * this.context.sampleRate,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  noteOff(
    noteNumber: number,
    channel: number = 0,
    delayTime: number = 0,
  ): void {
    if (!this.synth) return;
    this.synth.port.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "noteOff",
        channel,
        noteNumber,
        velocity: 0,
      },
      delayTime: delayTime * this.context.sampleRate,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  // Play a note for a specific duration (convenience method)
  playNote(noteNumber: number, duration: number, velocity: number = 100): void {
    this.noteOn(noteNumber, velocity);
    this.noteOff(noteNumber, 0, duration);
  }

  // Program change to select instrument preset
  programChange(program: number, channel: number = 0): void {
    if (!this.synth) return;
    this.synth.port.postMessage({
      type: "midi",
      midi: {
        type: "channel",
        subtype: "programChange",
        channel,
        value: program,
      },
      delayTime: 0,
      sequenceNumber: this.sequenceNumber++,
    });
  }

  disconnect(): void {
    if (this.synth) {
      this.synth.disconnect();
      this.synth = null;
    }
    this._loaded = false;
  }
}
