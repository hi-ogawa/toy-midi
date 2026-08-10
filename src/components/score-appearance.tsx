import type {
  ScoreLayout,
  ScoreTitleSpacing,
  ScoreViewerSettings,
} from "./score-viewer-runtime";

type ScoreAppearanceProps = {
  settings: ScoreViewerSettings;
  onChange: (update: Partial<ScoreViewerSettings>) => void;
};

const selectClassName =
  "h-8 w-32 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none";

export function ScoreAppearance({ settings, onChange }: ScoreAppearanceProps) {
  return (
    <div className="grid min-w-72 grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 text-sm text-neutral-300">
      <label htmlFor="score-layout">Layout</label>
      <select
        id="score-layout"
        value={settings.layout}
        onChange={(event) =>
          onChange({ layout: event.currentTarget.value as ScoreLayout })
        }
        className={selectClassName}
      >
        <option value="continuous">Continuous</option>
        <option value="paged">Pages</option>
      </select>

      <label htmlFor="score-title">Title</label>
      <input
        id="score-title"
        type="checkbox"
        checked={settings.showTitle}
        onChange={(event) =>
          onChange({ showTitle: event.currentTarget.checked })
        }
        className="justify-self-end size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
      />

      <label htmlFor="score-title-spacing">Title spacing</label>
      <select
        id="score-title-spacing"
        disabled={!settings.showTitle}
        value={settings.titleSpacing}
        onChange={(event) =>
          onChange({
            titleSpacing: event.currentTarget.value as ScoreTitleSpacing,
          })
        }
        className={selectClassName}
      >
        <option value="compact">Compact</option>
        <option value="normal">Normal</option>
        <option value="relaxed">Relaxed</option>
      </select>

      <label htmlFor="score-section-labels">Section labels</label>
      <input
        id="score-section-labels"
        type="checkbox"
        checked={settings.showSectionLabels}
        onChange={(event) =>
          onChange({ showSectionLabels: event.currentTarget.checked })
        }
        className="justify-self-end size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
      />
    </div>
  );
}
