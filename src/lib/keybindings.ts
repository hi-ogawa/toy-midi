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
    key: "M",
    description: "Toggle metronome",
    category: "playback",
  },
  {
    key: "Ctrl+F",
    description: "Toggle auto-scroll",
    category: "playback",
  },

  // Editing
  {
    key: "Delete / Backspace",
    description: "Delete selected notes/locator",
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
  {
    key: "L",
    description: "Add locator at playhead",
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
    action: "Ctrl + Drag selected note",
    description: "Duplicate and move selected notes",
    category: "editing",
  },
  {
    action: "Shift + Drag on empty space",
    description: "Box select multiple notes",
    category: "editing",
  },
  {
    action: "Click on keyboard",
    description: "Preview note sound",
    category: "editing",
  },
  {
    action: "Click on locator",
    description: "Select locator",
    category: "editing",
  },
  {
    action: "Double-click locator",
    description: "Rename locator",
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
];

// Category display names
export const CATEGORY_NAMES = {
  playback: "Playback",
  editing: "Editing",
  navigation: "Navigation",
} as const;
