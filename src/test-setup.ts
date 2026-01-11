/**
 * Test setup for Web Audio API mocking
 *
 * This setup file provides a minimal but complete mock of Web Audio API
 * to allow Tone.js to initialize for testing transport state.
 */

// More complete AudioNode mock with EventTarget support
class MockAudioNode extends EventTarget {
  context: any;
  numberOfInputs = 1;
  numberOfOutputs = 1;
  channelCount = 2;
  channelCountMode = "max";
  channelInterpretation = "speakers";

  constructor(context: any) {
    super();
    this.context = context;
  }

  connect() {
    return this;
  }
  disconnect() {}
}

class MockAudioParam {
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;

  constructor(value: number = 0) {
    this.value = value;
    this.defaultValue = value;
    this.minValue = -3.4028235e38;
    this.maxValue = 3.4028235e38;
  }

  setValueAtTime(value: number, time: number) {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    return this;
  }
  setTargetAtTime(target: number, startTime: number, timeConstant: number) {
    return this;
  }
  setValueCurveAtTime(
    values: Float32Array,
    startTime: number,
    duration: number,
  ) {
    return this;
  }
  cancelScheduledValues(startTime: number) {
    return this;
  }
  cancelAndHoldAtTime(cancelTime: number) {
    return this;
  }
}

class MockGainNode extends MockAudioNode {
  gain: MockAudioParam;

  constructor(context: any) {
    super(context);
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  frequency: MockAudioParam;
  detune: MockAudioParam;
  type: OscillatorType = "sine";

  constructor(context: any) {
    super(context);
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
  }

  start(when?: number) {}
  stop(when?: number) {}
}

class MockAudioBuffer {
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  duration: number;

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
  }

  getChannelData(channel: number) {
    return new Float32Array(this.length);
  }

  copyFromChannel(
    destination: Float32Array,
    channelNumber: number,
    startInChannel?: number,
  ) {}
  copyToChannel(
    source: Float32Array,
    channelNumber: number,
    startInChannel?: number,
  ) {}
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate: MockAudioParam;
  detune: MockAudioParam;

  constructor(context: any) {
    super(context);
    this.playbackRate = new MockAudioParam(1);
    this.detune = new MockAudioParam(0);
  }

  start(when?: number, offset?: number, duration?: number) {}
  stop(when?: number) {}
}

class MockAudioDestinationNode extends MockAudioNode {
  maxChannelCount = 2;

  constructor(context: any) {
    super(context);
    this.numberOfOutputs = 0;
  }
}

// Create a complete AudioContext mock
class MockAudioContext extends EventTarget {
  state: AudioContextState = "suspended";
  sampleRate = 44100;
  currentTime = 0;
  destination: MockAudioDestinationNode;
  listener = {};
  baseLatency = 0;
  outputLatency = 0;

  constructor() {
    super();
    this.destination = new MockAudioDestinationNode(this);
    // Auto-resume for tests
    setTimeout(() => {
      this.state = "running";
    }, 0);
  }

  createGain() {
    return new MockGainNode(this);
  }

  createOscillator() {
    return new MockOscillatorNode(this);
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode(this);
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }

  createConstantSource() {
    const node = new MockAudioNode(this);
    (node as any).offset = new MockAudioParam(1);
    (node as any).start = () => {};
    (node as any).stop = () => {};
    return node;
  }

  createDynamicsCompressor() {
    const node = new MockAudioNode(this);
    (node as any).threshold = new MockAudioParam(-24);
    (node as any).knee = new MockAudioParam(30);
    (node as any).ratio = new MockAudioParam(12);
    (node as any).attack = new MockAudioParam(0.003);
    (node as any).release = new MockAudioParam(0.25);
    (node as any).reduction = 0;
    return node;
  }

  createBiquadFilter() {
    const node = new MockAudioNode(this);
    (node as any).type = "lowpass";
    (node as any).frequency = new MockAudioParam(350);
    (node as any).Q = new MockAudioParam(1);
    (node as any).detune = new MockAudioParam(0);
    (node as any).gain = new MockAudioParam(0);
    return node;
  }

  createDelay(maxDelayTime?: number) {
    const node = new MockAudioNode(this);
    (node as any).delayTime = new MockAudioParam(0);
    return node;
  }

  createWaveShaper() {
    const node = new MockAudioNode(this);
    (node as any).curve = null;
    (node as any).oversample = "none";
    return node;
  }

  createPanner() {
    return new MockAudioNode(this);
  }

  createConvolver() {
    const node = new MockAudioNode(this);
    (node as any).buffer = null;
    (node as any).normalize = true;
    return node;
  }

  createChannelSplitter(numberOfOutputs?: number) {
    return new MockAudioNode(this);
  }

  createChannelMerger(numberOfInputs?: number) {
    return new MockAudioNode(this);
  }

  createAnalyser() {
    const node = new MockAudioNode(this);
    (node as any).fftSize = 2048;
    (node as any).frequencyBinCount = 1024;
    (node as any).minDecibels = -100;
    (node as any).maxDecibels = -30;
    (node as any).smoothingTimeConstant = 0.8;
    (node as any).getFloatFrequencyData = () => {};
    (node as any).getByteFrequencyData = () => {};
    (node as any).getFloatTimeDomainData = () => {};
    (node as any).getByteTimeDomainData = () => {};
    return node;
  }

  decodeAudioData(buffer: ArrayBuffer) {
    return Promise.resolve(this.createBuffer(2, 44100, 44100));
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }

  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

// Set up global mocks
(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).webkitAudioContext = MockAudioContext;
(globalThis as any).OfflineAudioContext = MockAudioContext;
(globalThis as any).AudioNode = MockAudioNode;
(globalThis as any).AudioParam = MockAudioParam;
