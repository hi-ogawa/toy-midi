export interface YouTubePlayerApi {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  getVideoData(): { title?: string };
  destroy(): void;
}

export interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars: Record<string, number>;
      events: {
        onReady: () => void;
        onError: () => void;
        onStateChange: (event: { data: number }) => void;
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

export function loadYouTubeApi(): Promise<YouTubeApi> {
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

export function parseYouTubeVideoId(value: string): string | undefined {
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
