type ParsedShortcut = {
  code?: string;
  key?: string;
  modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    ctrlOrMeta: boolean;
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
  if (lower === "escape" || lower === "esc") {
    return { code: "Escape", key: "Escape" };
  }
  if (lower === "delete" || lower === "del") {
    return { code: "Delete", key: "Delete" };
  }
  if (lower === "backspace" || lower === "bs") {
    return { code: "Backspace", key: "Backspace" };
  }

  return { key: token };
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const modifiers = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ctrlOrMeta: false,
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
    if (lower === "alt" || lower === "option") {
      modifiers.alt = true;
      continue;
    }
    if (lower === "ctrl" || lower === "control") {
      modifiers.ctrlOrMeta = true;
      continue;
    }
    if (lower === "cmd" || lower === "command" || lower === "meta") {
      modifiers.meta = true;
      continue;
    }
    keyToken = token;
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

  if (parsed.modifiers.ctrlOrMeta) {
    if (!e.ctrlKey && !e.metaKey) {
      return false;
    }
  } else {
    if (e.ctrlKey !== parsed.modifiers.ctrl) {
      return false;
    }
    if (e.metaKey !== parsed.modifiers.meta) {
      return false;
    }
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
