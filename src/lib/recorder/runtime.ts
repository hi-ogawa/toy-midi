import captureWorkletUrl from "./capture-worklet.js?worker&url";

const PREFERRED_INPUT_KEY = "toy-midi-recorder-preferred-input";
const PLAYBACK_LEAD_SECONDS = 0.03;

type RecorderStatus = "idle" | "ready" | "recording" | "processing";

interface RecorderSnapshot {
  status: RecorderStatus;
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
  inputSettings?: MediaTrackSettings;
  inputChannelCount: number;
  selectedChannel: number;
  backingName?: string;
  backingDuration: number;
  backingGain: number;
  backingMuted: boolean;
  isPlaying: boolean;
  position: number;
  takeUrl?: string;
  takeDuration: number;
  takeOffset: number;
  capturedFrames: number;
  firstCapturedFrame?: number;
  discontinuityFrames: number;
}

type RecordAnchor = {
  contextTime: number;
  timelineTime: number;
};

type EncoderResult = {
  type: "result";
  wav: ArrayBuffer;
  sampleCount: number;
  firstFrame?: number;
  discontinuityFrames: number;
};

class RecorderRuntime {
  #snapshot: RecorderSnapshot = {
    status: "idle",
    devices: [],
    inputChannelCount: 0,
    selectedChannel: 0,
    backingDuration: 0,
    backingGain: 1,
    backingMuted: false,
    isPlaying: false,
    position: 0,
    takeDuration: 0,
    takeOffset: 0,
    capturedFrames: 0,
    discontinuityFrames: 0,
  };
  readonly #listeners = new Set<() => void>();
  #context?: AudioContext;
  #stream?: MediaStream;
  #inputSource?: MediaStreamAudioSourceNode;
  #captureNode?: AudioWorkletNode;
  #silentGain?: GainNode;
  #backingBuffer?: AudioBuffer;
  #takeBuffer?: AudioBuffer;
  #backingSource?: AudioBufferSourceNode;
  #takeSource?: AudioBufferSourceNode;
  #backingGain?: GainNode;
  #playbackContextTime?: number;
  #playbackTimelineTime = 0;
  #frame?: number;
  #encoder?: Worker;
  #recordAnchor?: RecordAnchor;

  getSnapshot = (): RecorderSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async refreshDevices(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.#update({
      devices: devices.filter((device) => device.kind === "audioinput"),
    });
  }

  async enablePreferredInput(): Promise<void> {
    await this.selectInput(
      localStorage.getItem(PREFERRED_INPUT_KEY) ?? undefined,
    );
  }

  async selectInput(deviceId?: string): Promise<void> {
    const context = await this.#getContext();
    const constraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints,
      });
    } catch (error) {
      if (!deviceId) {
        throw error;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
        },
      });
    }

    this.#closeInput();
    this.#stream = stream;
    const track = stream.getAudioTracks()[0];
    if (!track) {
      throw new Error("The selected device did not provide an audio track.");
    }
    const settings = track.getSettings();
    if (settings.deviceId) {
      localStorage.setItem(PREFERRED_INPUT_KEY, settings.deviceId);
    }

    this.#inputSource = context.createMediaStreamSource(stream);
    this.#captureNode = new AudioWorkletNode(context, "recorder-capture", {
      channelCountMode: "max",
    });
    this.#captureNode.port.onmessage = this.#handleCaptureMessage;
    this.#silentGain = context.createGain();
    this.#silentGain.gain.value = 0;
    this.#inputSource.connect(this.#captureNode);
    this.#captureNode.connect(this.#silentGain).connect(context.destination);

    this.#update({
      status: "ready",
      selectedDeviceId: settings.deviceId ?? deviceId,
      inputSettings: settings,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
    await this.refreshDevices();
  }

  selectChannel(channel: number): void {
    this.#captureNode?.port.postMessage({ type: "select-channel", channel });
    this.#update({ selectedChannel: channel });
  }

  async loadBacking(file: File): Promise<void> {
    const context = await this.#getContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    this.#backingBuffer = buffer;
    this.stop();
    this.#update({
      backingName: file.name,
      backingDuration: buffer.duration,
      position: 0,
    });
  }

  setBackingGain(gain: number): void {
    this.#backingGain?.gain.setTargetAtTime(
      this.#snapshot.backingMuted ? 0 : gain,
      this.#context?.currentTime ?? 0,
      0.01,
    );
    this.#update({ backingGain: gain });
  }

  setBackingMuted(muted: boolean): void {
    this.#backingGain?.gain.setTargetAtTime(
      muted ? 0 : this.#snapshot.backingGain,
      this.#context?.currentTime ?? 0,
      0.01,
    );
    this.#update({ backingMuted: muted });
  }

  async play(): Promise<void> {
    if (this.#snapshot.isPlaying) {
      return;
    }
    const context = await this.#getContext();
    await context.resume();
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.#startPlaybackSources(startTime, this.#snapshot.position);
    this.#playbackContextTime = startTime;
    this.#playbackTimelineTime = this.#snapshot.position;
    this.#update({ isPlaying: true });
    this.#startFrame();
  }

  pause(): void {
    if (!this.#snapshot.isPlaying) {
      return;
    }
    this.#updatePosition();
    this.#stopPlaybackSources();
    this.#playbackContextTime = undefined;
    this.#update({ isPlaying: false });
    this.#stopFrameIfIdle();
  }

  stop(): void {
    this.#stopPlaybackSources();
    this.#playbackContextTime = undefined;
    this.#playbackTimelineTime = 0;
    this.#update({ isPlaying: false, position: 0 });
    this.#stopFrameIfIdle();
  }

  seek(position: number): void {
    const wasPlaying = this.#snapshot.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.#update({ position: Math.max(0, position) });
    if (wasPlaying) {
      void this.play();
    }
  }

  async startRecording(): Promise<void> {
    if (!this.#captureNode) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = await this.#getContext();
    await context.resume();
    if (!this.#snapshot.isPlaying) {
      await this.play();
    }
    this.#clearTake();
    this.#encoder?.terminate();
    this.#encoder = new Worker(new URL("./encode-worker.ts", import.meta.url), {
      type: "module",
    });
    this.#encoder.onmessage = this.#handleEncoderMessage;
    this.#encoder.postMessage({
      type: "start",
      sampleRate: context.sampleRate,
    });
    this.#recordAnchor = {
      contextTime: this.#playbackContextTime!,
      timelineTime: this.#playbackTimelineTime,
    };
    this.#captureNode.port.postMessage({ type: "start" });
    this.#update({
      status: "recording",
      capturedFrames: 0,
      firstCapturedFrame: undefined,
      discontinuityFrames: 0,
    });
    this.#startFrame();
  }

  stopRecording(): void {
    if (this.#snapshot.status !== "recording") {
      return;
    }
    this.#captureNode?.port.postMessage({ type: "stop" });
    this.#update({ status: "processing" });
  }

  setTakeOffset(offset: number): void {
    const wasPlaying = this.#snapshot.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.#update({ takeOffset: offset });
    if (wasPlaying) {
      void this.play();
    }
  }

  async #getContext(): Promise<AudioContext> {
    if (!this.#context) {
      this.#context = new AudioContext();
      await this.#context.audioWorklet.addModule(captureWorkletUrl);
    }
    return this.#context;
  }

  #startPlaybackSources(startTime: number, position: number): void {
    const context = this.#context!;
    this.#stopPlaybackSources();
    if (this.#backingBuffer) {
      this.#backingGain = context.createGain();
      this.#backingGain.gain.value = this.#snapshot.backingMuted
        ? 0
        : this.#snapshot.backingGain;
      this.#backingGain.connect(context.destination);
      this.#backingSource = this.#scheduleBuffer({
        buffer: this.#backingBuffer,
        output: this.#backingGain,
        startTime,
        position,
        timelineOffset: 0,
      });
    }
    if (this.#takeBuffer) {
      this.#takeSource = this.#scheduleBuffer({
        buffer: this.#takeBuffer,
        output: context.destination,
        startTime,
        position,
        timelineOffset: this.#snapshot.takeOffset,
      });
    }
    if (position === 0) {
      this.#scheduleClick(startTime);
    }
  }

  #scheduleBuffer({
    buffer,
    output,
    startTime,
    position,
    timelineOffset,
  }: {
    buffer: AudioBuffer;
    output: AudioNode;
    startTime: number;
    position: number;
    timelineOffset: number;
  }): AudioBufferSourceNode | undefined {
    const bufferOffset = Math.max(0, position - timelineOffset);
    if (bufferOffset >= buffer.duration) {
      return undefined;
    }
    const source = this.#context!.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(
      startTime + Math.max(0, timelineOffset - position),
      bufferOffset,
    );
    return source;
  }

  #scheduleClick(time: number): void {
    const context = this.#context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.value = 1000;
    envelope.gain.setValueAtTime(0.35, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.03);
  }

  #stopPlaybackSources(): void {
    this.#backingSource?.stop();
    this.#backingSource?.disconnect();
    this.#backingSource = undefined;
    this.#takeSource?.stop();
    this.#takeSource?.disconnect();
    this.#takeSource = undefined;
    this.#backingGain?.disconnect();
    this.#backingGain = undefined;
  }

  #updatePosition(): void {
    if (
      this.#context === undefined ||
      this.#playbackContextTime === undefined
    ) {
      return;
    }
    this.#update({
      position:
        this.#playbackTimelineTime +
        Math.max(0, this.#context.currentTime - this.#playbackContextTime),
    });
  }

  #startFrame(): void {
    if (this.#frame !== undefined) {
      return;
    }
    const tick = () => {
      if (this.#snapshot.isPlaying) {
        this.#updatePosition();
      }
      if (
        this.#snapshot.isPlaying ||
        this.#snapshot.status === "recording" ||
        this.#snapshot.status === "processing"
      ) {
        this.#frame = requestAnimationFrame(tick);
      } else {
        this.#frame = undefined;
      }
    };
    this.#frame = requestAnimationFrame(tick);
  }

  #stopFrameIfIdle(): void {
    if (
      this.#snapshot.isPlaying ||
      this.#snapshot.status === "recording" ||
      this.#snapshot.status === "processing" ||
      this.#frame === undefined
    ) {
      return;
    }
    cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
  }

  #handleCaptureMessage = (event: MessageEvent): void => {
    switch (event.data.type) {
      case "channel-layout": {
        const inputChannelCount = event.data.channelCount as number;
        const selectedChannel = Math.min(
          this.#snapshot.selectedChannel,
          Math.max(0, inputChannelCount - 1),
        );
        this.#update({ inputChannelCount, selectedChannel });
        this.selectChannel(selectedChannel);
        break;
      }
      case "pcm": {
        const samples = event.data.samples as Float32Array;
        this.#encoder?.postMessage(
          {
            type: "chunk",
            frame: event.data.frame,
            samples,
          },
          [samples.buffer],
        );
        break;
      }
      case "stopped": {
        this.#encoder?.postMessage({ type: "finish" });
        break;
      }
    }
  };

  #handleEncoderMessage = async (
    event: MessageEvent<EncoderResult>,
  ): Promise<void> => {
    if (event.data.type !== "result") {
      return;
    }
    const context = await this.#getContext();
    const blob = new Blob([event.data.wav], { type: "audio/wav" });
    const takeUrl = URL.createObjectURL(blob);
    this.#takeBuffer = await context.decodeAudioData(event.data.wav.slice(0));
    const firstFrame = event.data.firstFrame;
    const takeOffset =
      firstFrame !== undefined && this.#recordAnchor
        ? this.#recordAnchor.timelineTime +
          firstFrame / context.sampleRate -
          this.#recordAnchor.contextTime
        : this.#snapshot.position;
    this.#encoder?.terminate();
    this.#encoder = undefined;
    this.#recordAnchor = undefined;
    this.#update({
      status: "ready",
      takeUrl,
      takeDuration: event.data.sampleCount / context.sampleRate,
      takeOffset,
      capturedFrames: event.data.sampleCount,
      firstCapturedFrame: firstFrame,
      discontinuityFrames: event.data.discontinuityFrames,
    });
    this.#stopFrameIfIdle();
  };

  #closeInput(): void {
    this.#inputSource?.disconnect();
    this.#inputSource = undefined;
    this.#captureNode?.disconnect();
    this.#captureNode = undefined;
    this.#silentGain?.disconnect();
    this.#silentGain = undefined;
    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop();
    }
    this.#stream = undefined;
  }

  #clearTake(): void {
    if (this.#snapshot.takeUrl) {
      URL.revokeObjectURL(this.#snapshot.takeUrl);
    }
    this.#takeBuffer = undefined;
    this.#update({
      takeUrl: undefined,
      takeDuration: 0,
      takeOffset: 0,
    });
  }

  #update(update: Partial<RecorderSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const recorderRuntime = new RecorderRuntime();
