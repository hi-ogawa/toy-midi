import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { SCORE_VIEWER_SAMPLES } from "../lib/score-viewer-samples";

type ScoreViewerRuntimeState = {
  bar: number;
  beat: number;
  isPlaying: boolean;
  isReady: boolean;
  tempo: number;
};

const INITIAL_RUNTIME_STATE: ScoreViewerRuntimeState = {
  bar: 1,
  beat: 1,
  isPlaying: false,
  isReady: false,
  tempo: SCORE_VIEWER_SAMPLES[0].tempo,
};

export type ScoreLayout = "continuous" | "paged";

export type ScoreSource = {
  name: string;
  xml: string;
};

type CursorPosition = {
  time: number;
  x: number;
  top: number;
  height: number;
  systemId: number;
};

export class ScoreViewerRuntime {
  // DOM fields are initialized by attach() after the component commits.
  #container!: HTMLDivElement;
  #cursor!: HTMLDivElement;
  #scroller!: HTMLElement;
  #osmd!: OpenSheetMusicDisplay;
  readonly #listeners = new Set<() => void>();

  #positions: CursorPosition[] = [];
  #frame?: number;
  #startedAt?: number;
  #pausedAt = 0;
  #state = INITIAL_RUNTIME_STATE;

  getSnapshot = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  attach(root: HTMLElement) {
    this.#container = root.querySelector(
      '[data-testid="score-viewer-renderer"]',
    )!;
    this.#cursor = root.querySelector('[data-testid="score-viewer-cursor"]')!;
    this.#scroller = root.querySelector('[data-testid="score-viewer-scroll"]')!;
    this.#osmd = new OpenSheetMusicDisplay(this.#container, {
      autoBeam: true,
      autoGenerateMultipleRestMeasuresFromRestMeasures: false,
      backend: "svg",
      disableCursor: true,
      drawMeasureNumbersOnlyAtSystemStart: true,
      drawPartNames: false,
      drawTitle: false,
      pageBackgroundColor: "#ffffff",
    });
  }

  async load({ score, layout }: { score: ScoreSource; layout: ScoreLayout }) {
    this.#stop();
    this.#setState({ isReady: false });

    this.#osmd.clear();
    this.#osmd.setPageFormat(layout === "paged" ? "A4_P" : "Endless");
    await this.#osmd.load(score.xml);
    this.#osmd.render();

    this.#positions = buildCursorPositions(this.#osmd);
    this.#pausedAt = 0;
    this.#setState({
      bar: 1,
      beat: 1,
      isReady: true,
      tempo: parseTempo(score.xml),
    });
    this.#updateCursor(0);
  }

  togglePlayback() {
    if (this.#state.isPlaying) {
      this.#pausedAt = this.#getCurrentScoreTime();
      this.#stop();
      return;
    }
    if (!this.#state.isReady) {
      return;
    }
    this.#startedAt = performance.now();
    this.#setState({ isPlaying: true });
    this.#frame = requestAnimationFrame(this.#advance);
  }

  restart() {
    this.#stop();
    this.#pausedAt = 0;
    this.#updateCursor(0);
    this.#scroller.scrollTo({ top: 0 });
  }

  setTempo(tempo: number) {
    if (!Number.isFinite(tempo) || tempo <= 0) {
      return;
    }
    this.#pausedAt = this.#getCurrentScoreTime();
    if (this.#state.isPlaying) {
      this.#startedAt = performance.now();
    }
    this.#setState({ tempo });
  }

  seek(scoreTime: number) {
    this.#pausedAt = scoreTime;
    if (this.#state.isPlaying) {
      this.#startedAt = performance.now();
    }
    this.#updateCursor(scoreTime);
  }

  dispose() {
    cancelAnimationFrame(this.#frame ?? 0);
    this.#osmd.clear();
  }

  #stop() {
    cancelAnimationFrame(this.#frame ?? 0);
    this.#frame = undefined;
    this.#startedAt = undefined;
    this.#setState({ isPlaying: false });
  }

  #getCurrentScoreTime() {
    if (this.#startedAt === undefined) {
      return this.#pausedAt;
    }
    return (
      this.#pausedAt +
      ((performance.now() - this.#startedAt) / 1000) *
        (this.#state.tempo / 60 / 4)
    );
  }

  #advance = (now: number) => {
    if (this.#startedAt === undefined) {
      return;
    }
    const scoreTime =
      this.#pausedAt +
      ((now - this.#startedAt) / 1000) * (this.#state.tempo / 60 / 4);
    if (!this.#updateCursor(scoreTime)) {
      this.#pausedAt = 0;
      this.#stop();
      return;
    }
    this.#frame = requestAnimationFrame(this.#advance);
  };

  #updateCursor(scoreTime: number) {
    if (this.#positions.length < 2) {
      return false;
    }
    const last = this.#positions.at(-1)!;
    if (scoreTime >= last.time) {
      return false;
    }
    let nextIndex = this.#positions.findIndex(
      (position) => position.time > scoreTime,
    );
    if (nextIndex < 1) {
      nextIndex = 1;
    }
    const previous = this.#positions[nextIndex - 1];
    const next = this.#positions[nextIndex];
    const progress =
      next.systemId === previous.systemId
        ? (scoreTime - previous.time) / (next.time - previous.time)
        : // Do not interpolate diagonally between wrapped systems. The synthetic
          // system endpoint completes the previous row before this direct jump.
          0;
    this.#cursor.style.transform = `translate(${previous.x + (next.x - previous.x) * progress}px, ${previous.top}px)`;
    this.#cursor.style.height = `${previous.height}px`;
    this.#cursor.dataset.systemId = String(previous.systemId);
    const totalBeats = Math.floor(scoreTime * 4);
    const bar = Math.floor(totalBeats / 4) + 1;
    const beat = (totalBeats % 4) + 1;
    if (bar !== this.#state.bar || beat !== this.#state.beat) {
      this.#setState({ bar, beat });
    }

    // Match MuseScore's containment behavior: keep the viewport fixed while
    // the complete cursor is visible, then reveal the active system.
    const cursorBottom = previous.top + previous.height;
    if (
      previous.top < this.#scroller.scrollTop ||
      cursorBottom > this.#scroller.scrollTop + this.#scroller.clientHeight
    ) {
      this.#scroller.scrollTo({ top: Math.max(previous.top - 24, 0) });
    }
    return true;
  }

  #setState(update: Partial<ScoreViewerRuntimeState>) {
    this.#state = { ...this.#state, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function parseTempo(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const value = Number(
    document.querySelector("sound[tempo]")?.getAttribute("tempo") ??
      document.querySelector("metronome per-minute")?.textContent,
  );
  return Number.isFinite(value) && value > 0 ? value : 120;
}

function buildCursorPositions(osmd: OpenSheetMusicDisplay): CursorPosition[] {
  // OSMD's built-in cursor is not usable here: it steps between entries, and
  // its one-pixel-high bitmap renders as a horizontal mark in the SVG backend.
  // Keep OSMD for score geometry and render an independent browser overlay.
  //
  // MuseScore's playbackcursor.cpp::resolveCursorRectByTick algorithm:
  // 1. Find the measure containing the playback tick and its system.
  // 2. Walk visible chord/rest segments in that measure.
  // 3. Read each segment's tick and canvas x-position.
  // 4. Use the next visible chord/rest segment as the interval endpoint.
  // 5. For the final segment, use the measure end tick and end-barline x.
  // 6. Interpolate within the interval:
  //      x = x1 + (x2 - x1) * (tick - t1) / (t2 - t1)
  //
  // OSMD exposes entry geometry, so add each system's final timestamp and
  // right border to prevent a freeze before wrapping.
  const result: CursorPosition[] = [];
  const systems = osmd.GraphicSheet.MusicPages.flatMap(
    (page) => page.MusicSystems,
  );
  for (const container of osmd.GraphicSheet
    .VerticalGraphicalStaffEntryContainers) {
    const entry = container.getFirstNonNullStaffEntry();
    const system = entry?.parentMeasure.ParentMusicSystem;
    if (!entry || !system) {
      continue;
    }
    const topStaff = system.StaffLines[0];
    const bottomStaff = system.StaffLines.at(-1)!;
    const top = topStaff.PositionAndShape.AbsolutePosition.y * 10 - 20;
    const bottom =
      (bottomStaff.PositionAndShape.AbsolutePosition.y +
        bottomStaff.StaffHeight) *
        10 +
      20;
    result.push({
      time: container.AbsoluteTimestamp.RealValue,
      x: entry.PositionAndShape.AbsolutePosition.x * 10,
      top,
      height: bottom - top,
      systemId: system.Id,
    });
  }
  for (const system of systems) {
    const previous = result.findLast(
      (position) => position.systemId === system.Id,
    );
    if (previous) {
      result.push({
        ...previous,
        time: system.GetSystemsLastTimeStamp().RealValue,
        x: system.GetRightBorderAbsoluteXPosition() * 10,
      });
    }
  }
  return result.sort((a, b) => a.time - b.time || a.systemId - b.systemId);
}
