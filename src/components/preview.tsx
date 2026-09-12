import { routes } from "../lib/routes";
import { RecorderEffectsPreview } from "./recorder/recorder-effects-preview";
import { RecorderHelpPreview } from "./recorder/recorder-help-preview";

const PREVIEWS = [
  {
    label: "Recorder effects",
    component: RecorderEffectsPreview,
  },
  {
    label: "Recorder help dialog",
    component: RecorderHelpPreview,
  },
].map((entry) => ({
  ...entry,
  id: entry.label.toLowerCase().replaceAll(" ", "-"),
}));

export function Preview() {
  const previewId = new URL(window.location.href).searchParams.get("component");
  const preview =
    PREVIEWS.find((entry) => entry.id === previewId) ?? PREVIEWS[0];
  const SelectedPreview = preview.component;

  return (
    <main className="min-h-screen bg-neutral-950 px-8 pt-4 pb-10 text-neutral-100">
      <header className="mx-auto mb-4 flex max-w-[1600px] items-baseline gap-4 border-b border-neutral-800 pb-2">
        <h1 className="text-lg font-semibold">Preview</h1>
        <a
          href={routes.home.href()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300"
        >
          Back to app
        </a>
      </header>

      <div className="mx-auto flex max-w-[1600px] items-start gap-6">
        <nav
          aria-label="Previews"
          className="flex w-52 shrink-0 flex-col gap-1"
        >
          {PREVIEWS.map((entry) => (
            <a
              key={entry.id}
              href={`${routes.preview.href()}?component=${encodeURIComponent(entry.id)}`}
              aria-current={entry.id === preview.id ? "page" : undefined}
              className="rounded px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100 aria-[current=page]:bg-neutral-800 aria-[current=page]:text-neutral-100"
            >
              {entry.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <SelectedPreview />
        </div>
      </div>
    </main>
  );
}
