import { ExternalLinkIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../ui/button";

export function YouTubeReferenceSetup({
  initialVideoId,
  onSubmit,
}: {
  initialVideoId?: string;
  onSubmit: (videoId: string) => void;
}) {
  const [input, setInput] = useState(initialVideoId ?? "");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const videoId = parseYouTubeVideoId(input);
    if (!videoId) {
      setError("Enter a valid YouTube URL or video ID.");
      return;
    }
    onSubmit(videoId);
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <label className="min-w-0 flex-1 text-[11px] font-medium text-neutral-400">
        YouTube URL or video ID
        <input
          data-testid="recorder-youtube-input"
          value={input}
          onChange={(event) => {
            setInput(event.currentTarget.value);
            setError(undefined);
          }}
          placeholder="https://www.youtube.com/watch?v=..."
          autoFocus
          className="mt-1 h-9 w-full rounded border border-neutral-600 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-600"
        />
        {error && (
          <span className="mt-1.5 block text-xs font-normal text-orange-300">
            {error}
          </span>
        )}
      </label>
      <Button
        type="submit"
        className="mt-[19px] h-9 border-emerald-700 bg-emerald-700 px-4 text-sm text-white hover:bg-emerald-600"
      >
        {initialVideoId ? "Replace" : "Add video"}
      </Button>
    </form>
  );
}

export function YouTubeReference({
  videoId,
  onReplace,
  onRemove,
}: {
  videoId: string;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <section
      data-testid="recorder-youtube-reference"
      className="border-b border-neutral-700 bg-neutral-950"
    >
      <div className="mx-auto flex max-w-5xl items-stretch gap-4 px-5 py-4">
        <div className="aspect-video w-72 shrink-0 overflow-hidden rounded-md border border-neutral-700 bg-black shadow-lg">
          <iframe
            title="YouTube reference video"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?controls=0&disablekb=1&playsinline=1&rel=0`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full pointer-events-none"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
            Reference video
          </div>
          <div className="mt-2 truncate font-mono text-sm text-neutral-200">
            {videoId}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-500">
            Playback synchronization is not connected in this UI preview.
          </p>
          <div className="mt-auto flex items-center gap-2 pt-3">
            <Button
              onClick={onReplace}
              className="h-8 gap-1.5 border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              <Settings2Icon className="size-3.5" />
              Replace
            </Button>
            <Button
              onClick={onRemove}
              className="h-8 gap-1.5 border-neutral-700 bg-neutral-900 px-3 text-xs text-neutral-400 hover:border-red-900 hover:bg-red-950 hover:text-red-300"
            >
              <Trash2Icon className="size-3.5" />
              Remove
            </Button>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
            >
              Open on YouTube
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function parseYouTubeVideoId(value: string): string | undefined {
  const input = value.trim();
  if (/^[\w-]{11}$/.test(input)) {
    return input;
  }
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    let videoId: string | undefined;
    if (host === "youtu.be") {
      videoId = url.pathname.split("/")[1];
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      videoId =
        url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    }
    return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : undefined;
  } catch {
    return undefined;
  }
}
