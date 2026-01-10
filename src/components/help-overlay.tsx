import {
  CATEGORY_NAMES,
  KEYBOARD_SHORTCUTS,
  MOUSE_ACTIONS,
} from "../lib/keybindings";

type HelpOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

// Combined type for rendering
type HelpItem = {
  description: string;
  shortcut: string;
  isKeyboard: boolean;
};

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  if (!isOpen) return null;

  // Combine keyboard and mouse actions by category
  const categories = ["playback", "editing", "navigation"] as const;

  const itemsByCategory = categories.reduce(
    (acc, category) => {
      const items: HelpItem[] = [];

      // Add keyboard shortcuts for this category
      KEYBOARD_SHORTCUTS.filter((s) => s.category === category).forEach(
        (shortcut) => {
          items.push({
            description: shortcut.description,
            shortcut: shortcut.key,
            isKeyboard: true,
          });
        },
      );

      // Add mouse actions for this category
      MOUSE_ACTIONS.filter((a) => a.category === category).forEach((action) => {
        items.push({
          description: action.description,
          shortcut: action.action,
          isKeyboard: false,
        });
      });

      if (items.length > 0) {
        acc[category] = items;
      }
      return acc;
    },
    {} as Record<string, HelpItem[]>,
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
            Quick Reference
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
        <div className="p-6 space-y-6">
          {Object.entries(itemsByCategory).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-neutral-400 mb-2">
                {CATEGORY_NAMES[category as keyof typeof CATEGORY_NAMES]}
              </h3>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 bg-neutral-900 rounded"
                  >
                    <span className="text-neutral-300">{item.description}</span>
                    {item.isKeyboard ? (
                      <kbd className="px-3 py-1 bg-neutral-700 text-neutral-200 rounded font-mono text-sm border border-neutral-600">
                        {item.shortcut}
                      </kbd>
                    ) : (
                      <span className="text-neutral-400 text-sm font-mono">
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
