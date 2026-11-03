export type ComputerKeymap = {
  noteKeys: ReadonlyMap<string, number>;
  octaveKeys: ReadonlyMap<string, number>;
  velocityKeys?: ReadonlyMap<string, number>;
};

function createNoteKeys(rows: { lowestPitch: number; codes: string }[]) {
  return new Map(
    rows.flatMap(({ lowestPitch, codes }) =>
      codes.split(" ").map((code, i) => [code, lowestPitch + i] as const),
    ),
  );
}

/** Two piano-shaped rows, which reach the most notes without an octave shift. */
export const TWO_ROW_KEYMAP: ComputerKeymap = {
  noteKeys: createNoteKeys([
    {
      lowestPitch: 48,
      codes: "KeyZ KeyS KeyX KeyD KeyC KeyV KeyG KeyB KeyH KeyN KeyJ KeyM",
    },
    {
      lowestPitch: 60,
      codes:
        "KeyQ Digit2 KeyW Digit3 KeyE KeyR Digit5 KeyT Digit6 KeyY Digit7 KeyU KeyI Digit9 KeyO Digit0 KeyP",
    },
  ]),
  octaveKeys: new Map([
    ["BracketLeft", -1],
    ["BracketRight", 1],
  ]),
};

/** One piano-shaped row, which leaves the editor's R and M shortcuts free. */
export const ABLETON_KEYMAP: ComputerKeymap = {
  noteKeys: createNoteKeys([
    {
      lowestPitch: 48,
      codes:
        "KeyA KeyW KeyS KeyE KeyD KeyF KeyT KeyG KeyY KeyH KeyU KeyJ KeyK KeyO KeyL KeyP Semicolon Quote",
    },
  ]),
  octaveKeys: new Map([
    ["KeyZ", -1],
    ["KeyX", 1],
  ]),
  velocityKeys: new Map([
    ["KeyC", -20],
    ["KeyV", 20],
  ]),
};

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
  keymap,
  code,
  octave,
}: {
  keymap: ComputerKeymap;
  code: string;
  octave: number;
}): number | undefined {
  const pitch = keymap.noteKeys.get(code);
  return pitch === undefined ? undefined : pitch + octave * 12;
}

/** Lists the character printed on the computer key that plays each pitch. */
export function getComputerKeyLabels({
  keymap,
  octave,
}: {
  keymap: ComputerKeymap;
  octave: number;
}): Map<number, string> {
  return new Map(
    [...keymap.noteKeys].map(
      ([code, pitch]) =>
        [pitch + octave * 12, formatComputerKey(code)] as const,
    ),
  );
}

/** Formats a `KeyboardEvent.code` as the character printed on the key. */
export function formatComputerKey(code: string): string {
  return PUNCTUATION_KEYS[code] ?? code.replace(/^(Key|Digit)/, "");
}
