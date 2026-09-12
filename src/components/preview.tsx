import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { routes } from "../lib/routes";
import { RecorderEffectsPreview } from "./recorder/recorder-effects-preview";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const PREVIEWS = [
  {
    label: "Recorder effects",
    component: RecorderEffectsPreview,
  },
].map((entry) => ({
  ...entry,
  id: entry.label.toLowerCase().replaceAll(" ", "-"),
}));

export function Preview() {
  const [previewId, setPreviewId] = useState(readPreviewId);
  const preview = PREVIEWS.find((entry) => entry.id === previewId)!;
  const SelectedPreview = preview.component;

  useEffect(() => {
    const initialUrl = new URL(window.location.href);
    if (initialUrl.searchParams.get("component") !== previewId) {
      initialUrl.searchParams.set("component", previewId);
      window.history.replaceState({}, "", initialUrl);
    }
    const syncPreview = () => setPreviewId(readPreviewId());
    window.addEventListener("popstate", syncPreview);
    return () => window.removeEventListener("popstate", syncPreview);
  }, []);

  function selectPreview(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("component", id);
    window.history.pushState({}, "", url);
    setPreviewId(id);
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-8 py-10 text-neutral-100">
      <header className="mx-auto mb-8 flex max-w-6xl items-baseline gap-4 border-b border-neutral-800 pb-4">
        <h1 className="text-lg font-semibold">Preview</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2 px-3 py-1.5 text-xs hover:bg-neutral-800">
              {preview.label}
              <ChevronDownIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={previewId}
              onValueChange={selectPreview}
            >
              {PREVIEWS.map((entry) => (
                <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                  {entry.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <a
          href={routes.home.href()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300"
        >
          Back to app
        </a>
      </header>

      <div className="mx-auto flex max-w-6xl items-start gap-6">
        <SelectedPreview />
      </div>
    </main>
  );
}

function readPreviewId(): string {
  const value = new URL(window.location.href).searchParams.get("component");
  return PREVIEWS.find((entry) => entry.id === value)?.id ?? PREVIEWS[0].id;
}
