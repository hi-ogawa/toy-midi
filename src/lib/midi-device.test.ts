import { describe, expect, it } from "vitest";
import { encodeMidiDeviceMessage, parseMidiDeviceMessage } from "./midi-device";

describe("parseMidiDeviceMessage", () => {
  it("reads notes on any channel", () => {
    expect(parseMidiDeviceMessage(new Uint8Array([0x93, 60, 90]))).toEqual({
      type: "note-on",
      pitch: 60,
      velocity: 90,
    });
    expect(parseMidiDeviceMessage(new Uint8Array([0x83, 60, 64]))).toEqual({
      type: "note-off",
      pitch: 60,
    });
  });

  it("treats a note-on at velocity 0 as a note-off", () => {
    expect(parseMidiDeviceMessage(new Uint8Array([0x90, 60, 0]))).toEqual({
      type: "note-off",
      pitch: 60,
    });
  });

  it("combines pitch bend's two bytes, least significant first", () => {
    expect(parseMidiDeviceMessage(new Uint8Array([0xe0, 0, 64]))).toEqual({
      type: "pitch-bend",
      value: 8192,
    });
    expect(parseMidiDeviceMessage(new Uint8Array([0xe0, 127, 127]))).toEqual({
      type: "pitch-bend",
      value: 16383,
    });
  });

  it("keeps only the controllers a performance moves", () => {
    expect(parseMidiDeviceMessage(new Uint8Array([0xb0, 1, 80]))).toEqual({
      type: "controller",
      controller: 1,
      value: 80,
    });
    expect(
      parseMidiDeviceMessage(new Uint8Array([0xb0, 0, 1])),
    ).toBeUndefined();
  });

  it("ignores other messages", () => {
    expect(parseMidiDeviceMessage(new Uint8Array([0xf8]))).toBeUndefined();
    expect(parseMidiDeviceMessage(new Uint8Array([0xc0, 5]))).toBeUndefined();
  });
});

describe("encodeMidiDeviceMessage", () => {
  it.each([
    { type: "note-on", pitch: 60, velocity: 90 },
    { type: "note-off", pitch: 60 },
    { type: "controller", controller: 1, value: 64 },
    { type: "pitch-bend", value: 10_000 },
  ] as const)("writes what the parser reads for $type", (message) => {
    const bytes = new Uint8Array(encodeMidiDeviceMessage(message));
    expect(parseMidiDeviceMessage(bytes)).toEqual(message);
  });
});
