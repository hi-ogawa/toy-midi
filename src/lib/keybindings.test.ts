import { describe, expect, it } from "vitest";
import { KEYBOARD_SHORTCUTS } from "./keybindings";

describe("KEYBOARD_SHORTCUTS", () => {
  it("uses F for auto-scroll toggle", () => {
    expect(
      KEYBOARD_SHORTCUTS.find((x) => x.description === "Toggle auto-scroll"),
    ).toMatchObject({ key: "F", category: "playback" });
  });
});
