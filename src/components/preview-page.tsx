import { routes } from "../lib/routes";
import { BrowserStoragePreview } from "./browser-storage-preview";
import { EffectsPreview } from "./effects-preview";
import { HelpPreview } from "./help-preview";
import { SynthPreview } from "./synth-preview";
import { TunerPreview } from "./tuner-preview";

const PREVIEWS = [
  {
    label: "Browser storage dialog",
    component: BrowserStoragePreview,
  },
  {
    label: "Effects",
    component: EffectsPreview,
  },
  {
    label: "Help dialog",
    component: HelpPreview,
  },
  {
    label: "Synth",
    component: SynthPreview,
  },
  {
    label: "Tuner",
    component: TunerPreview,
  },
].map((entry) => ({
  ...entry,
  id: entry.label.toLowerCase().replaceAll(" ", "-"),
}));

export function PreviewPage() {
  const previewId = new URL(window.location.href).searchParams.get("component");
  const preview =
    PREVIEWS.find((entry) => entry.id === previewId) ?? PREVIEWS[0];
  const SelectedPreview = preview.component;

  return (
    <main className="min-h-screen bg-neutral-950 px-loose pt-normal pb-loose text-neutral-100">
      <header className="mx-auto mb-normal flex max-w-[1600px] items-baseline gap-normal border-b border-neutral-800 pb-snug">
        <h1 className="text-lg font-semibold">Preview</h1>
        <a
          href={routes.home.href()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300"
        >
          Back to app
        </a>
      </header>

      <div className="mx-auto flex max-w-[1600px] items-start gap-relaxed">
        <nav
          aria-label="Previews"
          className="flex w-52 shrink-0 flex-col gap-tight"
        >
          {PREVIEWS.map((entry) => (
            <a
              key={entry.id}
              href={`${routes.preview.href()}?component=${encodeURIComponent(entry.id)}`}
              aria-current={entry.id === preview.id ? "page" : undefined}
              className="rounded px-normal py-snug text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100 aria-[current=page]:bg-neutral-800 aria-[current=page]:text-neutral-100"
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
