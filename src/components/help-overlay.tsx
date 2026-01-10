import {
  CATEGORY_NAMES,
  KEYBOARD_SHORTCUTS,
  KeyBinding,
  MOUSE_ACTIONS,
  MouseAction,
} from "../lib/keybindings";

type HelpOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  if (!isOpen) return null;

  // Group keyboard shortcuts by category
  const keyboardByCategory = KEYBOARD_SHORTCUTS.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyBinding[]>,
  );

  // Group mouse actions by category
  const mouseByCategory = MOUSE_ACTIONS.reduce(
    (acc, action) => {
      if (!acc[action.category]) {
        acc[action.category] = [];
      }
      acc[action.category].push(action);
      return acc;
    },
    {} as Record<string, MouseAction[]>,
  );

  return (
    <div
      data-testid="help-overlay"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-neutral-800 border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-neutral-100">
            Keyboard Shortcuts & Mouse Actions
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-lg font-semibold text-neutral-200 mb-4">
              Keyboard Shortcuts
            </h3>
            <div className="space-y-6">
              {Object.entries(keyboardByCategory).map(
                ([category, shortcuts]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-neutral-400 mb-2">
                      {CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES]}
                    </h4>
                    <div className="space-y-2">
                      {shortcuts.map((shortcut, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-2 px-3 bg-neutral-900 rounded"
                        >
                          <span className="text-neutral-300">
                            {shortcut.description}
                          </span>
                          <kbd className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded font-mono text-sm border border-neutral-600">
                            {shortcut.key}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>

          {/* Mouse Actions */}
          <section>
            <h3 className="text-lg font-semibold text-neutral-200 mb-4">
              Mouse Actions
            </h3>
            <div className="space-y-6">
              {Object.entries(mouseByCategory).map(([category, actions]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-neutral-400 mb-2">
                    {CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES]}
                  </h4>
                  <div className="space-y-2">
                    {actions.map((action, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 bg-neutral-900 rounded"
                      >
                        <span className="text-neutral-300">
                          {action.description}
                        </span>
                        <span className="text-neutral-400 text-sm font-mono">
                          {action.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
