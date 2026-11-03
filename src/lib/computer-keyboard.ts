// Two piano-shaped rows, following physical key positions on any layout.
export const COMPUTER_KEY_ROWS = [
  {
    startPitch: 60,
    codes:
      "KeyQ Digit2 KeyW Digit3 KeyE KeyR Digit5 KeyT Digit6 KeyY Digit7 KeyU KeyI Digit9 KeyO Digit0 KeyP".split(
        " ",
      ),
  },
  {
    startPitch: 48,
    codes: "KeyZ KeyS KeyX KeyD KeyC KeyV KeyG KeyB KeyH KeyN KeyJ KeyM".split(
      " ",
    ),
  },
];

const KEY_CODE_PITCHES = new Map(
  COMPUTER_KEY_ROWS.flatMap(({ startPitch, codes }) =>
    codes.map((code, i) => [code, startPitch + i] as const),
  ),
);

/** Finds the pitch a computer key plays, from `KeyboardEvent.code`. */
export function getComputerKeyPitch({
  code,
  octave,
}: {
  code: string;
  octave: number;
}): number | undefined {
  const pitch = KEY_CODE_PITCHES.get(code);
  return pitch === undefined ? undefined : pitch + octave * 12;
}

/** Formats a `KeyboardEvent.code` as the character printed on the key. */
export function formatComputerKey(code: string): string {
  return code.replace(/^(Key|Digit)/, "");
}
