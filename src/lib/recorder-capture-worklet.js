class RecorderCaptureProcessor extends AudioWorkletProcessor {
  recording = false;
  selectedChannel = 0;
  observedChannelCount = -1;
  captureBuffer = new Float32Array(4096);
  captureLength = 0;
  captureStartFrame = 0;

  constructor() {
    super();
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "select-channel": {
          this.selectedChannel = event.data.channel;
          break;
        }
        case "start": {
          this.captureLength = 0;
          this.recording = true;
          break;
        }
        case "stop": {
          this.recording = false;
          this.flushCapture();
          this.port.postMessage({ type: "stopped" });
          break;
        }
      }
    };
  }

  process(inputs) {
    const input = inputs[0] ?? [];
    if (input.length !== this.observedChannelCount) {
      this.observedChannelCount = input.length;
      this.port.postMessage({
        type: "channel-layout",
        channelCount: input.length,
      });
    }
    if (this.recording && input.length > 0) {
      const source = input[Math.min(this.selectedChannel, input.length - 1)];
      this.appendCapture(source);
    } else if (this.recording && this.captureLength > 0) {
      this.flushCapture();
    }
    return true;
  }

  appendCapture(source) {
    let sourceOffset = 0;
    while (sourceOffset < source.length) {
      if (this.captureLength === 0) {
        this.captureStartFrame = currentFrame + sourceOffset;
      }
      const count = Math.min(
        source.length - sourceOffset,
        this.captureBuffer.length - this.captureLength,
      );
      this.captureBuffer.set(
        source.subarray(sourceOffset, sourceOffset + count),
        this.captureLength,
      );
      this.captureLength += count;
      sourceOffset += count;
      if (this.captureLength === this.captureBuffer.length) {
        this.flushCapture();
      }
    }
  }

  flushCapture() {
    if (this.captureLength === 0) {
      return;
    }
    const samples = this.captureBuffer.slice(0, this.captureLength);
    this.port.postMessage(
      { type: "pcm", frame: this.captureStartFrame, samples },
      [samples.buffer],
    );
    this.captureLength = 0;
  }
}

registerProcessor("recorder-capture", RecorderCaptureProcessor);
