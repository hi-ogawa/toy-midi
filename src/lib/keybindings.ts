// Centralized keybindings configuration
// Used to generate help overlay and maintain consistency

export type KeyBinding = {
  key: string;
  description: string;
  category: "playback" | "editing" | "navigation" | "help";
};

export type MouseAction = {
  action: string;
  description: string;
  category: "note-editing" | "selection" | "navigation";
};

export const KEYBOARD_SHORTCUTS: KeyBinding[] = [
  // Playback
  {
    key: "Space",
    description: "Play / Pause",
    category: "playback",
  },

  // Editing
  {
    key: "Delete",
    description: "Delete selected notes",
    category: "editing",
  },
  {
    key: "Backspace",
    description: "Delete selected notes",
    category: "editing",
  },
  {
    key: "Escape",
    description: "Deselect all notes",
    category: "editing",
  },

  // Help
  {
    key: "?",
    description: "Show / Hide this help",
    category: "help",
  },
];

export const MOUSE_ACTIONS: MouseAction[] = [
  // Note editing
  {
    action: "Click + Drag on empty space",
    description: "Create new note",
    category: "note-editing",
  },
  {
    action: "Drag note body",
    description: "Move note (time + pitch)",
    category: "note-editing",
  },
  {
    action: "Drag note edge",
    description: "Resize note duration",
    category: "note-editing",
  },

  // Selection
  {
    action: "Click on note",
    description: "Select note",
    category: "selection",
  },
  {
    action: "Shift + Click on note",
    description: "Add note to selection",
    category: "selection",
  },
  {
    action: "Shift + Drag on empty space",
    description: "Box select multiple notes",
    category: "selection",
  },

  // Navigation
  {
    action: "Mouse wheel",
    description: "Scroll horizontally / vertically",
    category: "navigation",
  },
  {
    action: "Ctrl + Mouse wheel",
    description: "Zoom in / out",
    category: "navigation",
  },
  {
    action: "Click on timeline",
    description: "Seek to position",
    category: "navigation",
  },
];

// Category display names
export const CATEGORY_NAMES = {
  playback: "Playback",
  editing: "Editing",
  navigation: "Navigation",
  help: "Help",
  "note-editing": "Note Editing",
  selection: "Selection",
} as const;
