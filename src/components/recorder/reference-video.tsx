import { CircleHelpIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { useResizeObserver } from "../../hooks/use-resize-observer";
import { clamp } from "../../lib/music";
import {
  RecorderRuntime,
  type ReferenceVideoState,
} from "../../lib/recorder/runtime";
import {
  createYouTubePlayer,
  loadYouTubeApi,
  parseYouTubeVideoId,
  type YouTubePlayerApi,
} from "../../lib/youtube";
import { Button } from "../ui/button";
import { FloatingPanel } from "../ui/floating-panel";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function ReferenceVideoPanel({
  referenceVideo,
  runtime,
  size,
  onSizeChange,
  onClose,
}: {
  referenceVideo?: ReferenceVideoState;
  runtime: RecorderRuntime;
  size: { width: number; height: number };
  onSizeChange: (size: { width: number; height: number }) => void;
  onClose: () => void;
}) {
  const resizeHandleRef = usePointerDrag({
    onStart: (event) => {
      const target = event.target;
      const panel = target instanceof HTMLElement ? target.offsetParent : null;
      if (!(panel instanceof HTMLElement)) {
        throw new Error("Reference video panel is missing.");
      }
      return {
        x: event.clientX,
        y: event.clientY,
        panelRect: panel.getBoundingClientRect(),
      };
    },
    onMove: (event, drag) => {
      onSizeChange({
        width: clamp(
          drag.panelRect.width + drag.x - event.clientX,
          360,
          window.innerWidth - 32,
        ),
        height: clamp(
          drag.panelRect.height + drag.y - event.clientY,
          300,
          window.innerHeight - 32,
        ),
      });
    },
  });

  return (
    <FloatingPanel
      title={
        <span className="flex items-center gap-2">
          Reference video
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="About reference video"
                className="text-neutral-500 hover:text-neutral-200"
              >
                <CircleHelpIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-72 space-y-2 p-3 text-xs"
            >
              <p>
                For tighter recording sync, generate and download backing stems
                with Stem Mixer for YouTube, then import them as an audio track
                here. Keep this video muted as a visual reference.
              </p>
              <a
                href="https://github.com/hi-ogawa/youtube-audio-replacement"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                Open Stem Mixer for YouTube
              </a>
            </PopoverContent>
          </Popover>
        </span>
      }
      closeLabel="Close Reference Video"
      onClose={onClose}
      testId="recorder-youtube-reference"
      className="flex flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <button
        ref={resizeHandleRef}
        type="button"
        aria-label="Resize Reference Video"
        data-testid="recorder-reference-video-resize-handle"
        className="group absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none items-start justify-start p-1"
      >
        <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500 transition-colors group-hover:border-neutral-200 group-active:border-emerald-400" />
      </button>
      <YouTubeReferencePanel
        referenceVideo={referenceVideo}
        runtime={runtime}
      />
    </FloatingPanel>
  );
}

function YouTubeReferencePanel({
  referenceVideo,
  runtime,
}: {
  referenceVideo?: ReferenceVideoState;
  runtime: RecorderRuntime;
}) {
  const [candidateVideoId, setCandidateVideoId] = useState<string>();
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewRef = useResizeObserver((element) => {
    const width = Math.min(
      element.clientWidth,
      (element.clientHeight * 16) / 9,
    );
    setPreviewSize({ width, height: (width * 9) / 16 });
  });
  useEffect(() => {
    // Clear the candidate once runtime owns the same video so it cannot mask
    // later runtime changes or resurface after removal. Waiting for matching
    // props keeps the newly attached player mounted during that handoff.
    if (candidateVideoId === referenceVideo?.videoId) {
      setCandidateVideoId(undefined);
    }
  }, [candidateVideoId, referenceVideo?.videoId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={previewRef}
        data-testid="recorder-reference-video-preview"
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-950 p-3"
      >
        <div className="shrink-0 overflow-hidden bg-black" style={previewSize}>
          {candidateVideoId || referenceVideo ? (
            <YouTubeReference
              videoId={candidateVideoId ?? referenceVideo!.videoId}
              runtime={runtime}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs text-neutral-600">
              Add a YouTube video
            </div>
          )}
        </div>
      </div>
      {!referenceVideo && !candidateVideoId && (
        <div className="shrink-0 border-t border-neutral-700 bg-neutral-800 p-4">
          <YouTubeReferenceSetup onSubmit={setCandidateVideoId} />
        </div>
      )}
    </div>
  );
}

function YouTubeReferenceSetup({
  onSubmit,
}: {
  onSubmit: (videoId: string) => void;
}) {
  const [input, setInput] = useState("");
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
        Add video
      </Button>
    </form>
  );
}

function YouTubeReference({
  videoId,
  runtime,
}: {
  videoId: string;
  runtime: RecorderRuntime;
}) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hasRenderedVideo, setHasRenderedVideo] = useState(false);
  const [error, setError] = useState<string>();

  const mountPlayer = useCallback(
    (element: HTMLDivElement) => {
      setIsPlayerReady(false);
      setHasRenderedVideo(false);
      setError(undefined);
      const mounted = mountYouTubeReference({
        element,
        videoId,
        runtime,
        onReady: () => setIsPlayerReady(true),
        onPlaying: () => setHasRenderedVideo(true),
        onError: (nextError) => setError(nextError.message),
      });
      return () => mounted.dispose();
    },
    [runtime, videoId],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mountPlayer} className="h-full w-full" />
      {!hasRenderedVideo && (
        <div
          data-testid="recorder-reference-video-placeholder"
          className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
          {!isPlayerReady && !error && (
            <LoaderCircleIcon className="absolute top-3 right-3 size-4 animate-spin text-white/70" />
          )}
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-black/80 px-3 py-2 text-xs text-orange-300">
          {error}
        </div>
      )}
    </div>
  );
}

interface MountedYouTubeReference {
  dispose(): void;
}

function mountYouTubeReference({
  element,
  videoId,
  runtime,
  onReady,
  onPlaying,
  onError,
}: {
  element: HTMLElement;
  videoId: string;
  runtime: RecorderRuntime;
  onReady: () => void;
  onPlaying: () => void;
  onError: (error: Error) => void;
}): MountedYouTubeReference {
  let disposed = false;
  let player: YouTubePlayerApi | undefined;
  let detachPlayer: (() => void) | undefined;

  const initialize = async () => {
    const YT = await loadYouTubeApi();
    if (disposed) {
      return;
    }
    player = await createYouTubePlayer({
      YT,
      element,
      videoId,
      onStateChange: (event) => {
        if (event.data === 1) {
          onPlaying();
        }
      },
    });
    if (disposed) {
      player.destroy();
      player = undefined;
      return;
    }
    detachPlayer = runtime.attachYouTubePlayer({ videoId, player });
    onReady();
  };

  void initialize().catch((error: unknown) => {
    if (!disposed) {
      onError(error instanceof Error ? error : new Error("Unknown error"));
    }
  });

  return {
    dispose() {
      disposed = true;
      detachPlayer?.();
      detachPlayer = undefined;
      player?.destroy();
      player = undefined;
    },
  };
}
