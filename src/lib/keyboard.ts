type ParsedShortcut = {
  code?: string;
  key?: string;
  modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
  };
};

function normalizeKeyToken(token: string): { code?: string; key?: string } {
  if (!token) {
    return {};
  }
  if (token.length === 1) {
    const char = token.toUpperCase();
    if (char >= "A" && char <= "Z") {
      return { code: `Key${char}` };
    }
    if (char >= "0" && char <= "9") {
      return { code: `Digit${char}` };
    }
  }

  const lower = token.toLowerCase();
  if (lower === "space") {
    return { code: "Space", key: " " };
  }
  if (lower === "escape") {
    return { code: "Escape", key: "Escape" };
  }
  if (lower === "delete") {
    return { code: "Delete", key: "Delete" };
  }
  if (lower === "backspace") {
    return { code: "Backspace", key: "Backspace" };
  }

  throw new Error(`Unsupported shortcut token: ${token}`);
}

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
    throw new Error(`Unsupported shortcut token: ${token}`);
  }

  if (!keyToken) {
    throw new Error("Shortcut must include key");
  }

  return {
    ...normalizeKeyToken(keyToken),
    modifiers,
  };
}

export function matchKeyboardEvent(
  e: KeyboardEvent,
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
