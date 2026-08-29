import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { useResizeObserver } from "../../hooks/use-resize-observer";
import { clamp } from "../../lib/music";
import type { ReferencePlayback } from "../../lib/recorder/reference-playback";
import {
  RecorderRuntime,
  type ReferenceVideoState,
} from "../../lib/recorder/runtime";
import {
  loadYouTubeApi,
  parseYouTubeVideoId,
  type YouTubePlayerApi,
} from "../../lib/youtube";
import { Button } from "../ui/button";
import { FloatingPanel } from "../ui/floating-panel";

export function ReferenceVideoPanel({
  referenceVideo,
  runtime,
  onClose,
}: {
  referenceVideo?: ReferenceVideoState;
  runtime: RecorderRuntime;
  onClose: () => void;
}) {
  const [size, setSize] = useState({ width: 480, height: 480 });
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
      setSize({
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
      title="Reference video"
      headerActions={
        referenceVideo && (
          <a
            href={`https://www.youtube.com/watch?v=${referenceVideo.videoId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-normal text-neutral-400 hover:text-neutral-200"
          >
            Open on YouTube
            <ExternalLinkIcon className="size-3" />
          </a>
        )
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
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewRef = useResizeObserver((element) => {
    const width = Math.min(
      element.clientWidth,
      (element.clientHeight * 16) / 9,
    );
    setPreviewSize({ width, height: (width * 9) / 16 });
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={previewRef}
        data-testid="recorder-reference-video-preview"
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-950 p-3"
      >
        <div className="shrink-0 overflow-hidden bg-black" style={previewSize}>
          {referenceVideo ? (
            <YouTubeReference
              referenceVideo={referenceVideo}
              runtime={runtime}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs text-neutral-600">
              Add a YouTube video
            </div>
          )}
        </div>
      </div>
      {!referenceVideo && (
        <div className="shrink-0 border-t border-neutral-700 bg-neutral-800 p-4">
          <YouTubeReferenceSetup
            onSubmit={(videoId) => runtime.setReferenceVideo(videoId)}
          />
        </div>
      )}
    </div>
  );
}

function YouTubeReferenceSetup({
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

function YouTubeReference({
  referenceVideo,
  runtime,
}: {
  referenceVideo: ReferenceVideoState;
  runtime: RecorderRuntime;
}) {
  const [hasRenderedVideo, setHasRenderedVideo] = useState(false);
  const [error, setError] = useState<string>();

  const mountPlayer = useCallback(
    (element: HTMLDivElement) => {
      setHasRenderedVideo(false);
      setError(undefined);
      const mounted = mountYouTubeReference({
        element,
        videoId: referenceVideo.videoId,
        runtime,
        onPlaying: () => setHasRenderedVideo(true),
        onError: (nextError) => setError(nextError.message),
      });
      return () => mounted.dispose();
    },
    [referenceVideo.videoId, runtime],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mountPlayer} className="h-full w-full pointer-events-none" />
      {!hasRenderedVideo && (
        <div
          data-testid="recorder-reference-video-placeholder"
          className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
        >
          <img
            src={`https://i.ytimg.com/vi/${referenceVideo.videoId}/maxresdefault.jpg`}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
          {!error && (
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
  onPlaying,
  onError,
}: {
  element: HTMLElement;
  videoId: string;
  runtime: RecorderRuntime;
  onPlaying: () => void;
  onError: (error: Error) => void;
}): MountedYouTubeReference {
  let disposed = false;
  let player: YouTubePlayerApi | undefined;
  let playback: ReferencePlayback | undefined;

  const syncReferenceVideo = () => {
    const referenceVideo = runtime.store.get().referenceVideo;
    if (referenceVideo?.videoId !== videoId) {
      return;
    }
    if (referenceVideo.muted) {
      player?.mute();
    } else {
      player?.unMute();
    }
    playback?.setState({
      timelineStart: referenceVideo.timelineStart,
      duration: referenceVideo.duration,
    });
  };
  const unsubscribe = runtime.store.subscribeWithSelector({
    selector: (state) => state.referenceVideo,
    listener: syncReferenceVideo,
    equals: Object.is,
  });

  void (async () => {
    try {
      const YT = await loadYouTubeApi();
      if (disposed) {
        return;
      }
      player = new YT.Player(element, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (disposed || !player) {
              return;
            }
            const duration = player.getDuration();
            const metadata = {
              title: player.getVideoData().title,
              duration: duration > 0 ? duration : undefined,
            };
            playback = runtime.createReferencePlayback({
              play: (time) => {
                player!.seekTo(time, true);
                player!.playVideo();
              },
              pause: (time) => {
                player!.pauseVideo();
                player!.seekTo(time, true);
              },
            });
            runtime.setReferenceVideoMetadata(metadata);
            syncReferenceVideo();
          },
          onError: () =>
            onError(new Error("YouTube could not load this video.")),
          onStateChange: (event) => {
            if (event.data === 1) {
              onPlaying();
            }
          },
        },
      });
    } catch (error) {
      if (!disposed) {
        onError(error instanceof Error ? error : new Error("Unknown error"));
      }
    }
  })();

  return {
    dispose() {
      disposed = true;
      unsubscribe();
      playback?.dispose();
      playback = undefined;
      player?.destroy();
      player = undefined;
    },
  };
}
