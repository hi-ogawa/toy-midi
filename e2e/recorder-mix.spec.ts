import { expect, test } from "@playwright/test";

test("offline mix preserves stereo, resamples mono regions, and applies track/master gains", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/recorder/mix.ts";
    const { renderRecorderMix } = (await import(
      modulePath
    )) as typeof import("../src/lib/recorder/mix.ts");
    const stereo = new AudioBuffer({
      numberOfChannels: 2,
      length: 48000,
      sampleRate: 48000,
    });
    stereo.getChannelData(0).fill(0.25);
    stereo.getChannelData(1).fill(-0.5);
    const mono = new AudioBuffer({
      numberOfChannels: 1,
      length: 22050,
      sampleRate: 22050,
    });
    mono.getChannelData(0).fill(0.75);
    const buffer = (await renderRecorderMix({
      sampleRate: 48000,
      mix: {
        duration: 1.5,
        masterGain: 0.5,
        tracks: [
          {
            gain: 0.5,
            regions: [
              { buffer: stereo, start: 0.25, offset: 0.25, duration: 0.75 },
            ],
          },
          {
            gain: 4,
            regions: [
              { buffer: mono, start: 0.5, offset: 0.25, duration: 0.25 },
              { buffer: mono, start: 1, offset: 0.5, duration: 0.25 },
            ],
          },
          {
            gain: 0,
            regions: [{ buffer: stereo, start: 0.5, offset: 0, duration: 1 }],
          },
        ],
      },
    }))!;
    return {
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      length: buffer.length,
      samples: [0.1, 0.3, 0.6, 0.8, 1.1, 1.4].map((time) =>
        [0, 1].map(
          (channel) => buffer.getChannelData(channel)[Math.round(time * 48000)],
        ),
      ),
    };
  });
  expect(result.channels).toBe(2);
  expect(result.sampleRate).toBe(48000);
  expect(result.length).toBe(72000);
  const expected = [
    [0, 0],
    [0.0625, -0.125],
    [1.5625, 1.375],
    [0.0625, -0.125],
    [1.5, 1.5],
    [0, 0],
  ];
  for (const [index, channels] of expected.entries()) {
    for (const [channel, sample] of channels.entries()) {
      expect(result.samples[index]![channel]).toBeCloseTo(sample, 5);
    }
  }
});
