import type { ComponentProps } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
import type { ScoreLayout, ScoreViewerSettings } from "./score-viewer-runtime";

type ScoreSettingsProps = {
  settings: ScoreViewerSettings;
  onChange: (update: Partial<ScoreViewerSettings>) => void;
};

export function ScoreSettings({ settings, onChange }: ScoreSettingsProps) {
  const titleSpacingInput = useDraftInput({
    value: settings.titleSpacing,
    onCommit: (titleSpacing) => onChange({ titleSpacing }),
    step: 0.5,
    parse: "float",
  });

  return (
    <div className="grid min-w-72 grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 text-sm text-neutral-300">
      <label htmlFor="score-layout">Layout</label>
      <SettingsSelect
        id="score-layout"
        value={settings.layout}
        onChange={(event) =>
          onChange({ layout: event.currentTarget.value as ScoreLayout })
        }
      >
        <option value="continuous">Continuous</option>
        <option value="paged">Pages</option>
      </SettingsSelect>

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
      <input
        id="score-title-spacing"
        type="number"
        disabled={!settings.showTitle}
        {...titleSpacingInput.props}
        className="h-8 w-32 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
      />

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

function SettingsSelect(props: ComponentProps<"select">) {
  return (
    <select
      className="h-8 w-32 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
      {...props}
    />
  );
}
