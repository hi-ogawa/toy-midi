import { describe, expect, test } from "vitest";
import { formatStemFileName } from "./stem-export.ts";

describe(formatStemFileName, () => {
  test("numbers stems in track order and sanitizes names", () => {
    expect(formatStemFileName(1, "Bass")).toBe("01-Bass.wav");
    expect(formatStemFileName(2, " Lead guitar ")).toBe("02-Lead_guitar.wav");
    expect(formatStemFileName(12, "Drums/Kit")).toBe("12-Drums_Kit.wav");
  });
});
