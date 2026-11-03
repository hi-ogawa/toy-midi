export const LOWER_ROW_PITCH = 48;
export const UPPER_ROW_PITCH = 60;

// Two piano-shaped rows, following physical key positions on any layout.
const LOWER_ROW = "KeyZ KeyS KeyX KeyD KeyC KeyV KeyG KeyB KeyH KeyN KeyJ KeyM";
const UPPER_ROW =
  "KeyQ Digit2 KeyW Digit3 KeyE KeyR Digit5 KeyT Digit6 KeyY Digit7 KeyU KeyI Digit9 KeyO Digit0 KeyP";

const KEY_CODE_PITCHES = new Map([
  ...LOWER_ROW.split(" ").map(
    (code, i) => [code, LOWER_ROW_PITCH + i] as const,
  ),
  ...UPPER_ROW.split(" ").map(
    (code, i) => [code, UPPER_ROW_PITCH + i] as const,
  ),
]);

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
