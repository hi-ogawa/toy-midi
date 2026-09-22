import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject, enableInput } from "./recorder-helpers";

useFakeAudioInput();

test("enables input with a suspended audio context before playback", async ({
  page,
}) => {
  // Retain the real context so suspension is deterministic despite the autoplay test flag.
  await page.addInitScript(() => {
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        Object.assign(window, { inputTestContext: this });
      }
    };
  });

  // Open a project and suspend audio before the user enables input.
  await createRecorderProject(page);
  const contextState = await page.evaluate(async () => {
    const { inputTestContext } = window as typeof window & {
      inputTestContext: AudioContext;
    };
    await inputTestContext.suspend();
    return inputTestContext.state;
  });
  expect(contextState).toBe("suspended");

  // Enable input without playback and discover channels after resuming the context.
  await enableInput(page);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { inputTestContext: AudioContext })
          .inputTestContext.state,
    ),
  ).toBe("running");
});
