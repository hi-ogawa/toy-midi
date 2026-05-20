type ParsedShortcut = {
  code?: string;
  key?: string;
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

export function isShortcutTextInputTarget(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && target.type !== "range") ||
    target instanceof HTMLTextAreaElement
  );
}

const SPECIAL_KEYS: Record<string, { code: string; key: string }> = {
  Space: { code: "Space", key: " " },
  Escape: { code: "Escape", key: "Escape" },
  Enter: { code: "Enter", key: "Enter" },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp" },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown" },
  Delete: { code: "Delete", key: "Delete" },
  Backspace: { code: "Backspace", key: "Backspace" },
};

const CHAR_KEYS: Record<string, { code: string }> = Object.fromEntries([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((char) => [char, { code: `Key${char}` }]),
  ..."0123456789".split("").map((char) => [char, { code: `Digit${char}` }]),
]);

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
  if (!parsed.code && !parsed.key) {
    return false;
  }

  if (e.metaKey) {
    return false;
  }
  if (e.ctrlKey !== parsed.modifiers.ctrl) {
    return false;
  }
  if (e.shiftKey !== parsed.modifiers.shift) {
    return false;
  }
  if (e.altKey !== parsed.modifiers.alt) {
    return false;
  }

  if (parsed.code) {
    return e.code === parsed.code;
  }
  if (parsed.key) {
    return e.key.toLowerCase() === parsed.key.toLowerCase();
  }

  return false;
}
