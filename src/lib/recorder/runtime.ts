import {
  CaptureWorkletClient,
  type CaptureWorkletNotification,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";

const PREFERRED_INPUT_KEY = "toy-midi-recorder-preferred-input";
const PLAYBACK_LEAD_SECONDS = 0.03;
const MAX_RECORDING_SECONDS = 5 * 60;

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
  hasTake: boolean;
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
    hasTake: false,
    takeDuration: 0,
    takeOffset: 0,
    capturedFrames: 0,
    discontinuityFrames: 0,
  };
  readonly #listeners = new Set<() => void>();
  #context?: AudioContext;
  #workletReady = false;
  #stream?: MediaStream;
  #inputSource?: MediaStreamAudioSourceNode;
  #captureWorklet?: CaptureWorkletClient;
  #silentGain?: GainNode;
  #backingBuffer?: AudioBuffer;
  #takeBuffer?: AudioBuffer;
  #backingSource?: AudioBufferSourceNode;
  #takeSource?: AudioBufferSourceNode;
  #backingGain?: GainNode;
  #playbackContextTime?: number;
  #playbackTimelineTime = 0;
  #frame?: number;
  #recordAnchor?: RecordAnchor;
  #captureBuffer?: Float32Array;
  #captureLength = 0;
  #nextCaptureFrame?: number;

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
    this.#captureWorklet = new CaptureWorkletClient({
      context,
      onNotification: this.#handleCaptureMessage,
    });
    this.#silentGain = context.createGain();
    this.#silentGain.gain.value = 0;
    this.#inputSource
      .connect(this.#captureWorklet.node)
      .connect(this.#silentGain)
      .connect(context.destination);

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
    this.#captureWorklet?.setChannel(channel);
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
    if (!this.#captureWorklet) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = await this.#getContext();
    await context.resume();
    if (!this.#snapshot.isPlaying) {
      await this.play();
    }
    this.#clearTake();
    this.#captureBuffer = new Float32Array(
      Math.floor(context.sampleRate * MAX_RECORDING_SECONDS),
    );
    this.#captureLength = 0;
    this.#nextCaptureFrame = undefined;
    this.#recordAnchor = {
      contextTime: this.#playbackContextTime!,
      timelineTime: this.#playbackTimelineTime,
    };
    this.#captureWorklet.start();
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
    this.#captureWorklet?.stop();
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
    }
    if (!this.#workletReady) {
      const blob = new Blob([createCaptureWorkletSource()], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      try {
        await this.#context.audioWorklet.addModule(url);
        this.#workletReady = true;
      } finally {
        URL.revokeObjectURL(url);
      }
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

  #handleCaptureMessage = (message: CaptureWorkletNotification): void => {
    switch (message.type) {
      case "channels": {
        const inputChannelCount = message.value;
        const selectedChannel = Math.min(
          this.#snapshot.selectedChannel,
          Math.max(0, inputChannelCount - 1),
        );
        this.#update({ inputChannelCount, selectedChannel });
        this.selectChannel(selectedChannel);
        break;
      }
      case "samples": {
        const { frameStart: frame, samples } = message;
        const captureBuffer = this.#captureBuffer;
        if (
          !captureBuffer ||
          (this.#snapshot.status !== "recording" &&
            this.#snapshot.status !== "processing")
        ) {
          break;
        }
        const count = Math.min(
          samples.length,
          captureBuffer.length - this.#captureLength,
        );
        captureBuffer.set(samples.subarray(0, count), this.#captureLength);
        const firstCapturedFrame = this.#snapshot.firstCapturedFrame ?? frame;
        const discontinuityFrames =
          this.#snapshot.discontinuityFrames +
          (this.#nextCaptureFrame === undefined
            ? 0
            : frame - this.#nextCaptureFrame);
        this.#captureLength += count;
        this.#nextCaptureFrame = frame + samples.length;
        this.#update({
          capturedFrames: this.#captureLength,
          firstCapturedFrame,
          discontinuityFrames,
        });
        if (
          this.#captureLength === captureBuffer.length &&
          this.#snapshot.status === "recording"
        ) {
          this.stopRecording();
        }
        break;
      }
      case "stopped": {
        this.#finishRecording();
        break;
      }
    }
  };

  #finishRecording(): void {
    const context = this.#context;
    const captureBuffer = this.#captureBuffer;
    if (!context || !captureBuffer || this.#captureLength === 0) {
      this.#captureBuffer = undefined;
      this.#captureLength = 0;
      this.#nextCaptureFrame = undefined;
      this.#recordAnchor = undefined;
      this.#update({ status: "ready" });
      this.#stopFrameIfIdle();
      return;
    }
    this.#takeBuffer = context.createBuffer(
      1,
      this.#captureLength,
      context.sampleRate,
    );
    this.#takeBuffer
      .getChannelData(0)
      .set(captureBuffer.subarray(0, this.#captureLength));
    const firstFrame = this.#snapshot.firstCapturedFrame;
    const takeOffset =
      firstFrame !== undefined && this.#recordAnchor
        ? this.#recordAnchor.timelineTime +
          firstFrame / context.sampleRate -
          this.#recordAnchor.contextTime
        : this.#snapshot.position;
    this.#captureBuffer = undefined;
    this.#captureLength = 0;
    this.#nextCaptureFrame = undefined;
    this.#recordAnchor = undefined;
    this.#update({
      status: "ready",
      hasTake: true,
      takeDuration: this.#takeBuffer.duration,
      takeOffset,
    });
    this.#stopFrameIfIdle();
  }

  #closeInput(): void {
    this.#inputSource?.disconnect();
    this.#inputSource = undefined;
    this.#captureWorklet?.dispose();
    this.#captureWorklet = undefined;
    this.#silentGain?.disconnect();
    this.#silentGain = undefined;
    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop();
    }
    this.#stream = undefined;
  }

  #clearTake(): void {
    this.#takeBuffer = undefined;
    this.#update({
      hasTake: false,
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
