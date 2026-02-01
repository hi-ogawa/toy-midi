import { describe, expect, it } from "vitest";
import { parseShortcut } from "./keyboard";

describe("parseShortcut", () => {
  it("parses plain letter shortcuts without modifiers", () => {
    const parsed = parseShortcut("L");
    expect(parsed).toMatchInlineSnapshot(`
      {
        "code": "KeyL",
        "modifiers": {
          "alt": false,
          "ctrl": false,
          "shift": false,
        },
      }
    `);
  });

  it("parses ctrl combos", () => {
    const parsed = parseShortcut("Ctrl+F");
    expect(parsed).toMatchInlineSnapshot(`
      {
        "code": "KeyF",
        "modifiers": {
          "alt": false,
          "ctrl": true,
          "shift": false,
        },
      }
    `);
  });

  it("parses digit shortcuts", () => {
    const parsed = parseShortcut("Shift+1");
    expect(parsed).toMatchInlineSnapshot(`
      {
        "code": "Digit1",
        "modifiers": {
          "alt": false,
          "ctrl": false,
          "shift": true,
        },
      }
    `);
  });

  it("rejects unsupported modifiers", () => {
    expect(() => parseShortcut("Cmd+L")).toThrowErrorMatchingInlineSnapshot(
      '"Unsupported shortcut token: Cmd"',
    );
  });
});
