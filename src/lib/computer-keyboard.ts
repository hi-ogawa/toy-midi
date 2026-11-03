const LOWEST_PITCH = 60;

// A piano-shaped pair of rows, following physical key positions on any layout.
export const COMPUTER_NOTE_KEYS =
  "KeyA KeyW KeyS KeyE KeyD KeyF KeyT KeyG KeyY KeyH KeyU KeyJ KeyK KeyO KeyL KeyP Semicolon Quote".split(
    " ",
  );

export function getComputerKeyPitch({
  code,
  octave,
}: {
  code: string;
  octave: number;
}): number | undefined {
  const index = COMPUTER_NOTE_KEYS.indexOf(code);
  return index < 0 ? undefined : LOWEST_PITCH + index + octave * 12;
}

/** Formats a `KeyboardEvent.code` as the character printed on the key. */
export function formatComputerKey(code: string): string {
  switch (code) {
    case "Semicolon": {
      return ";";
    }
    case "Quote": {
      return "'";
    }
    default: {
      return code.replace(/^Key/, "");
    }
  }
}
