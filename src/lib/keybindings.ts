// Centralized keybindings configuration
// Used to generate help overlay and maintain consistency

export type KeyBinding = {
  key: string;
  description: string;
  category: "playback" | "editing" | "navigation";
};

export type MouseAction = {
  action: string;
  description: string;
  category: "editing" | "navigation";
};

export const KEYBOARD_SHORTCUTS: KeyBinding[] = [
  // Playback
  {
    key: "Space",
    description: "Play / Pause",
    category: "playback",
  },
  {
    key: "Ctrl+F",
    description: "Toggle auto-scroll",
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
  {
    key: "Ctrl+C",
    description: "Copy selected notes (Cmd+C on Mac)",
    category: "editing",
  },
  {
    key: "Ctrl+V",
    description: "Paste notes (Cmd+V on Mac)",
    category: "editing",
  },
  {
    key: "Ctrl+Z",
    description: "Undo",
    category: "editing",
  },
  {
    key: "Ctrl+Shift+Z",
    description: "Redo",
    category: "editing",
  },
  {
    key: "Ctrl+Y",
    description: "Redo (alternative)",
    category: "editing",
  },
];

export const MOUSE_ACTIONS: MouseAction[] = [
  // Editing
  {
    action: "Click + Drag on empty space",
    description: "Create new note",
    category: "editing",
  },
  {
    action: "Drag note body",
    description: "Move note (time + pitch)",
    category: "editing",
  },
  {
    action: "Drag note edge",
    description: "Resize note duration",
    category: "editing",
  },
  {
    action: "Click on note",
    description: "Select note",
    category: "editing",
  },
  {
    action: "Shift + Click on note",
    description: "Add note to selection",
    category: "editing",
  },
  {
    action: "Shift + Drag on empty space",
    description: "Box select multiple notes",
    category: "editing",
  },
  {
    action: "Click on keyboard sidebar",
    description: "Preview MIDI note sound",
    category: "editing",
  },

  // Navigation
  {
    action: "Mouse wheel",
    description: "Scroll horizontally / vertically",
    category: "navigation",
  },
  {
    action: "Ctrl + Mouse wheel",
    description: "Zoom in / out (horizontal)",
    category: "navigation",
  },
  {
    action: "Shift + Mouse wheel",
    description: "Zoom in / out (vertical)",
    category: "navigation",
  },
  {
    action: "Click on timeline",
    description: "Seek to position",
    category: "navigation",
  },
  {
    action: "Drag audio waveform",
    description: "Adjust audio offset (timeline position)",
    category: "navigation",
  },
  {
    action: "Drag bottom edge of waveform",
    description: "Resize waveform height",
    category: "navigation",
  },
];

// Category display names
export const CATEGORY_NAMES = {
  playback: "Playback",
  editing: "Editing",
  navigation: "Navigation",
} as const;
