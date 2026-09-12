import { routes } from "../lib/routes";
import { RecorderEffectsPreview } from "./previews/recorder-effects-preview";

export function ComponentPreview() {
  return (
    <main className="min-h-screen bg-neutral-950 px-8 py-10 text-neutral-100">
      <header className="mx-auto mb-8 flex max-w-6xl items-baseline gap-4 border-b border-neutral-800 pb-4">
        <h1 className="text-lg font-semibold">Component Preview</h1>
        <a
          href={routes.home.href()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300"
        >
          Back to app
        </a>
      </header>

      <div className="mx-auto flex max-w-6xl items-start gap-6">
        <RecorderEffectsPreview />
      </div>
    </main>
  );
}
