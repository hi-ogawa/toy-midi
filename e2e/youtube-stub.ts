import type { Page } from "@playwright/test";

const FAKE_VIDEO_DURATION_SECONDS = 120;

// A 1x1 transparent GIF stands in for video thumbnails.
const THUMBNAIL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Serve a local fake of YouTube and abort every other YouTube request. */
export async function stubYouTube(page: Page): Promise<void> {
  await page.route(
    /^https:\/\/([\w-]+\.)*(youtube(-nocookie)?\.com|ytimg\.com|youtu\.be)\//,
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/iframe_api") {
        return route.fulfill({
          contentType: "text/javascript",
          body: `(${installFakeYouTubeApi.toString()})(${FAKE_VIDEO_DURATION_SECONDS});`,
        });
      }
      if (url.pathname.startsWith("/embed/")) {
        return route.fulfill({ contentType: "text/html", body: "" });
      }
      if (url.hostname.endsWith("ytimg.com")) {
        return route.fulfill({ contentType: "image/gif", body: THUMBNAIL });
      }
      return route.abort();
    },
  );
}

// Runs in the browser. Like the real API, the player replaces the target
// element with an embed iframe and reports ready asynchronously.
function installFakeYouTubeApi(duration: number): void {
  type Options = {
    videoId: string;
    host?: string;
    events: {
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
    };
  };

  class Player {
    private readonly iframe: HTMLIFrameElement;
    private readonly events: Options["events"];
    private time = 0;
    private rate = 1;
    private playingSince?: number;

    constructor(element: HTMLElement, options: Options) {
      this.events = options.events;
      this.iframe = document.createElement("iframe");
      this.iframe.src = `${options.host ?? "https://www.youtube.com"}/embed/${options.videoId}`;
      this.iframe.className = element.className;
      element.replaceWith(this.iframe);
      setTimeout(() => this.events.onReady());
    }

    playVideo(): void {
      this.playingSince ??= performance.now();
      this.events.onStateChange({ data: 1 });
    }

    pauseVideo(): void {
      this.time = this.getCurrentTime();
      this.playingSince = undefined;
      this.events.onStateChange({ data: 2 });
    }

    mute(): void {}

    unMute(): void {}

    setPlaybackRate(rate: number): void {
      this.time = this.getCurrentTime();
      this.playingSince &&= performance.now();
      this.rate = rate;
    }

    seekTo(seconds: number): void {
      this.time = seconds;
      this.playingSince &&= performance.now();
    }

    getCurrentTime(): number {
      const elapsed =
        this.playingSince === undefined
          ? 0
          : ((performance.now() - this.playingSince) / 1000) * this.rate;
      return Math.min(this.time + elapsed, duration);
    }

    getDuration(): number {
      return duration;
    }

    getVideoData(): { title?: string } {
      return { title: "Fake YouTube Video" };
    }

    destroy(): void {
      this.iframe.remove();
    }
  }

  Object.assign(window, { YT: { Player } });
  (
    window as { onYouTubeIframeAPIReady?: () => void }
  ).onYouTubeIframeAPIReady?.();
}
