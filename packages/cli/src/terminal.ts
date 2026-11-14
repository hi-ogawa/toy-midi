import { styleText } from "node:util";

export function style(format: Parameters<typeof styleText>[0], text: string) {
  return styleText(format, text, { stream: process.stderr });
}

export function writeLine(text: string) {
  process.stderr.write(`${text}\n`);
}

// Print a finished line in place of any in-place progress line.
export function finishLine(text: string) {
  rewriteLine("");
  writeLine(text);
}

// Replace the current terminal line. Off a terminal, only finished lines print.
export function rewriteLine(text: string) {
  if (process.stderr.isTTY) {
    process.stderr.write(`\r${text}\x1b[K`);
  }
}

export function formatDuration(ms: number) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, "0")}s`;
}
