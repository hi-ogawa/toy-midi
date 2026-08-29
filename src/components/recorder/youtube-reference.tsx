import { useEffect, useRef, useState, type FormEvent } from "react";
import { ReferencePlayback } from "../../lib/recorder/reference-playback";
import {
  RecorderRuntime,
  type ReferenceVideoState,
} from "../../lib/recorder/runtime";
import { Button } from "../ui/button";

interface YouTubePlayerApi {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  getVideoData(): { title?: string };
  destroy(): void;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars: Record<string, number>;
      events: {
        onReady: () => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayerApi;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | undefined;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT) {
    return Promise.resolve(window.YT);
  }
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () =>
        reject(new Error("Could not load YouTube player."));
      window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
      document.head.appendChild(script);
    });
  }
  return youtubeApiPromise;
}

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
  referenceVideo,
  runtime,
  onSubmit,
}: {
  referenceVideo: ReferenceVideoState;
  runtime: RecorderRuntime;
  onSubmit: (videoId: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<ReferencePlayback>(undefined);
  const playerRef = useRef<YouTubePlayerApi>(undefined);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const element = mountRef.current;
    if (!element) {
      return;
    }
    let disposed = false;
    let player: YouTubePlayerApi | undefined;
    let playback: ReferencePlayback | undefined;
    void loadYouTubeApi()
      .then((YT) => {
        if (disposed) {
          return;
        }
        player = new YT.Player(element, {
          videoId: referenceVideo.videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              if (disposed || !player) {
                return;
              }
              playback = new ReferencePlayback(runtime.getTransport(), {
                play: (time) => {
                  player!.seekTo(time, true);
                  player!.playVideo();
                },
                pause: (time) => {
                  player!.pauseVideo();
                  player!.seekTo(time, true);
                },
              });
              playbackRef.current = playback;
              playerRef.current = player;
              if (referenceVideo.muted) {
                player.mute();
              } else {
                player.unMute();
              }
              const duration = player.getDuration();
              const title = player.getVideoData().title;
              runtime.setReferenceVideoMetadata({
                duration: duration > 0 ? duration : undefined,
                title,
              });
              playback.setState({
                timelineStart: referenceVideo.timelineStart,
                duration: duration > 0 ? duration : undefined,
              });
            },
            onError: () => setError("YouTube could not load this video."),
          },
        });
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "Unknown error");
        }
      });
    return () => {
      disposed = true;
      playback?.dispose();
      if (playbackRef.current === playback) {
        playbackRef.current = undefined;
      }
      if (playerRef.current === player) {
        playerRef.current = undefined;
      }
      player?.destroy();
    };
  }, [referenceVideo.videoId, runtime]);

  useEffect(() => {
    playbackRef.current?.setState({
      timelineStart: referenceVideo.timelineStart,
      duration: referenceVideo.duration,
    });
  }, [referenceVideo.duration, referenceVideo.timelineStart]);

  useEffect(() => {
    if (referenceVideo.muted) {
      playerRef.current?.mute();
    } else {
      playerRef.current?.unMute();
    }
  }, [referenceVideo.muted]);

  const videoId = referenceVideo.videoId;
  return (
    <div>
      <div className="aspect-video bg-black">
        <div ref={mountRef} className="h-full w-full pointer-events-none" />
      </div>
      {error && (
        <div className="px-4 pt-3 text-xs text-orange-300">{error}</div>
      )}
      <div className="space-y-3 border-t border-neutral-700 p-4">
        <YouTubeReferenceSetup
          key={videoId}
          initialVideoId={videoId}
          onSubmit={onSubmit}
        />
      </div>
    </div>
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
