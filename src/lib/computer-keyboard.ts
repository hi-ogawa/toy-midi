// Two piano-shaped rows, following physical key positions on any layout.
const LOWER_NOTE_KEYS =
  "KeyZ KeyS KeyX KeyD KeyC KeyV KeyG KeyB KeyH KeyN KeyJ KeyM";
const UPPER_NOTE_KEYS =
  "KeyQ Digit2 KeyW Digit3 KeyE KeyR Digit5 KeyT Digit6 KeyY Digit7 KeyU KeyI Digit9 KeyO Digit0 KeyP";

const KEY_CODE_PITCHES = new Map([
  ...LOWER_NOTE_KEYS.split(" ").map((code, i) => [code, 48 + i] as const),
  ...UPPER_NOTE_KEYS.split(" ").map((code, i) => [code, 60 + i] as const),
]);

/** The character keys of a US keyboard, with each row's stagger in key widths. */
export const COMPUTER_KEYBOARD_ROWS = [
  {
    stagger: 0,
    codes:
      "Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal",
  },
  {
    stagger: 1.5,
    codes:
      "KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight",
  },
  {
    stagger: 1.75,
    codes: "KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote",
  },
  {
    stagger: 2.25,
    codes: "KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash",
  },
].map(({ stagger, codes }) => ({ stagger, codes: codes.split(" ") }));

const PUNCTUATION_KEYS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

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
  return PUNCTUATION_KEYS[code] ?? code.replace(/^(Key|Digit)/, "");
}
