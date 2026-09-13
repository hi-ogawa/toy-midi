type ShortcutKey = ({ code: string } | { key: string }) & {
  ignoreShift?: boolean;
};

type ParsedShortcut = ShortcutKey & {
  modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
  };
};

type KeyboardLikeEvent = {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/**
 * Use `code` for a physical key or `key` for a character produced by the layout.
 * `ignoreShift` allows either Shift state for that key, while an explicit
 * `Shift+` in the shortcut still requires Shift to be held.
 */
const SPECIAL_KEYS: Record<string, ShortcutKey> = {
  "<": { key: "<", ignoreShift: true },
  ">": { key: ">", ignoreShift: true },
  Space: { code: "Space" },
  Escape: { code: "Escape" },
  Enter: { code: "Enter" },
  ArrowLeft: { code: "ArrowLeft" },
  ArrowRight: { code: "ArrowRight" },
  ArrowUp: { code: "ArrowUp" },
  ArrowDown: { code: "ArrowDown" },
  Delete: { code: "Delete" },
  Backspace: { code: "Backspace" },
};

const CHAR_KEYS: Record<string, { code: string }> = Object.fromEntries([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((char) => [char, { code: `Key${char}` }]),
  ..."0123456789".split("").map((char) => [char, { code: `Digit${char}` }]),
]);

/**
 * Parses a key with optional `Ctrl+`, `Alt+`, and `Shift+` modifiers, such as
 * `Ctrl+S`, `Shift+1`, or `>`. `Ctrl` matches either Control or Command.
 * Letters and digits match physical keys; other keys use `SPECIAL_KEYS`.
 * Unlisted modifiers must be released, except Shift when `ignoreShift` is set.
 * Throws for unknown keys or multiple key tokens.
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  const modifiers = {
    shift: false,
    alt: false,
    ctrl: false,
  };
  let keyToken = "";

  const tokens = shortcut
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "shift") {
      modifiers.shift = true;
      continue;
    }
    if (lower === "alt") {
      modifiers.alt = true;
      continue;
    }
    if (lower === "ctrl") {
      modifiers.ctrl = true;
      continue;
    }
    if (!keyToken) {
      keyToken = token;
      continue;
    }
    throw new Error(`Invalid shortcut '${shortcut}'`);
  }

  const match = CHAR_KEYS[keyToken.toUpperCase()] || SPECIAL_KEYS[keyToken];
  if (!match) {
    throw new Error(`Invalid shortcut '${shortcut}'`);
  }

  return {
    ...match,
    modifiers,
  };
}

export function matchKeyboardEvent(
  e: KeyboardLikeEvent,
  shortcut: string,
): boolean {
  const parsed = parseShortcut(shortcut);

  if ((e.ctrlKey || e.metaKey) !== parsed.modifiers.ctrl) {
    return false;
  }
  if (e.ctrlKey && e.metaKey) {
    return false;
  }
  // An explicit Shift modifier overrides the key's default policy.
  if (
    (!parsed.ignoreShift || parsed.modifiers.shift) &&
    e.shiftKey !== parsed.modifiers.shift
  ) {
    return false;
  }
  if (e.altKey !== parsed.modifiers.alt) {
    return false;
  }

  return "code" in parsed
    ? e.code === parsed.code
    : e.key.toLowerCase() === parsed.key.toLowerCase();
}

export function isShortcutTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    // Custom sliders use arrow keys but are not native form controls.
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.getAttribute("role") === "slider"))
  );
}
