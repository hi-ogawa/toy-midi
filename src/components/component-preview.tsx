import type { ReactNode } from "react";
import { routes } from "../lib/routes";
import { EqResponseGraphPreview } from "./previews/eq-response-graph-preview";

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

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <PreviewCard
          title="EQ response graph"
          description="Drag to change frequency and gain. Scroll over the graph to change Q."
        >
          <EqResponseGraphPreview />
        </PreviewCard>
      </div>
    </main>
  );
}

function PreviewCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl">
      <header className="border-b border-neutral-700 px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs text-neutral-400">{description}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
