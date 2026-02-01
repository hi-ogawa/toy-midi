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

  it("parses special keys", () => {
    expect(parseShortcut("Enter")).toMatchInlineSnapshot(`
      {
        "code": "Enter",
        "key": "Enter",
        "modifiers": {
          "alt": false,
          "ctrl": false,
          "shift": false,
        },
      }
    `);
    expect(parseShortcut("ArrowUp")).toMatchInlineSnapshot(`
      {
        "code": "ArrowUp",
        "key": "ArrowUp",
        "modifiers": {
          "alt": false,
          "ctrl": false,
          "shift": false,
        },
      }
    `);
    expect(parseShortcut("ArrowDown")).toMatchInlineSnapshot(`
      {
        "code": "ArrowDown",
        "key": "ArrowDown",
        "modifiers": {
          "alt": false,
          "ctrl": false,
          "shift": false,
        },
      }
    `);
  });

  it("invalid", () => {
    expect(() => parseShortcut("Cmd+L")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid shortcut 'Cmd+L']`,
    );
    expect(() => parseShortcut("Esc")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid shortcut 'Esc']`,
    );
    expect(() => parseShortcut("Del")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid shortcut 'Del']`,
    );
    expect(() => parseShortcut("Bs")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid shortcut 'Bs']`,
    );
  });
});
