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

/**
 * A playback anchor in OSMD's rendered score.
 *
 * Most anchors correspond to graphical staff entries. Synthetic anchors at
 * system ends let the cursor finish a row before jumping to the next system.
 * Playback interpolates horizontally between adjacent anchors in one system.
 */
type CursorPosition = {
  /** Score time in whole-note units, matching OSMD's Fraction.RealValue. */
  time: number;
  /** Horizontal cursor position in CSS pixels within the rendered score. */
  x: number;
  /** Top edge of the active system in CSS pixels. */
  top: number;
  /** Cursor height spanning the active system in CSS pixels. */
  height: number;
  /** OSMD system identity, used to avoid interpolation across wrapped rows. */
  systemId: number;
};

// OSMD reads its layout width from the container's offsetWidth. This value was
// calibrated to roughly match MuseScore's apparent sheet size at its 100% view,
// which is an application-specific scale rather than a physical CSS pixel size.
// TODO: Expose this as a layout density control without coupling it to view zoom.
const SCORE_LAYOUT_WIDTH = 1110;

export class ScoreViewerRuntime {
  // attach() initializes the runtime-owned DOM:
  // <root>
  //   <scroller>
  //     <sheet>
  //       <cursor />
  //       <container />
  //     </sheet>
  //   </scroller>
  // </root>
  #root!: HTMLDivElement;
  #container!: HTMLDivElement;
  #cursor!: HTMLDivElement;
  #scroller!: HTMLElement;
  #sheet!: HTMLDivElement;

  #osmd!: OpenSheetMusicDisplay;

  #positions: CursorPosition[] = [];
  #state = INITIAL_RUNTIME_STATE;
  readonly #listeners = new Set<() => void>();

  readonly #clock = new PlayheadClock();

  constructor() {
    this.#clock.subscribe(() => {
      const { currentTime, paused } = this.#clock.getSnapshot();
      const scoreTime = secondsToScoreTime(currentTime, this.#state.tempo);
      const { bar, beat } = scoreTimeToBarBeat(scoreTime);
      if (bar !== this.#state.bar || beat !== this.#state.beat) {
        this.#setState({ bar, beat });
      }
      this.#updateCursor(scoreTime);
      const isPlaying = !paused;
      if (isPlaying !== this.#state.isPlaying) {
        this.#setState({ isPlaying });
      }
    });
  }

  getSnapshot = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  attach(root: HTMLDivElement) {
    this.#root = root;
    this.#root.replaceChildren();

    this.#scroller = document.createElement("section");
    this.#scroller.dataset.testid = "score-viewer-scroll";
    this.#scroller.className = "h-full overflow-y-auto p-6";

    this.#sheet = document.createElement("div");
    this.#sheet.className = "relative mx-auto";
    this.#sheet.hidden = true;
    this.#sheet.style.width = `${SCORE_LAYOUT_WIDTH}px`;

    this.#cursor = document.createElement("div");
    this.#cursor.dataset.testid = "score-viewer-cursor";
    this.#cursor.className =
      "pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-blue-500";

    this.#container = document.createElement("div");
    this.#container.dataset.testid = "score-viewer-renderer";
    this.#container.style.width = `${SCORE_LAYOUT_WIDTH}px`;

    this.#sheet.append(this.#cursor, this.#container);
    this.#scroller.append(this.#sheet);
    this.#root.append(this.#scroller);
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
    this.#clock.stop();
    this.#setState({ isReady: false });

    this.#osmd.clear();
    this.#osmd.setPageFormat(layout === "paged" ? "A4_P" : "Endless");
    await this.#osmd.load(score.xml);
    this.#sheet.hidden = false;
    this.#osmd.render();

    this.#sheet.className =
      layout === "continuous"
        ? "relative mx-auto bg-white px-4 shadow-xl"
        : "relative mx-auto";
    this.#positions = buildCursorPositions(this.#osmd);
    this.#clock.stop();
    this.#setState({
      bar: 1,
      beat: 1,
      isReady: true,
      tempo: parseTempo(score.xml),
    });
    this.#updateCursor(0);
  }

  togglePlayback() {
    if (!this.#clock.getSnapshot().paused) {
      this.#clock.pause();
      return;
    }
    if (!this.#state.isReady) {
      return;
    }
    this.#clock.play();
  }

  restart() {
    this.#clock.stop();
    this.#scroller.scrollTo({ top: 0 });
  }

  setTempo(tempo: number) {
    if (!Number.isFinite(tempo) || tempo <= 0) {
      return;
    }
    this.#setState({ tempo });
    this.restart();
  }

  seek(scoreTime: number) {
    this.#clock.seek(scoreTimeToSeconds(scoreTime, this.#state.tempo));
  }

  dispose() {
    this.#clock.stop();
    if (this.#root.hasChildNodes()) {
      this.#osmd.clear();
      this.#root.replaceChildren();
    }
  }

  #updateCursor(scoreTime: number) {
    if (this.#positions.length < 2) {
      return;
    }

    // Keep transport time unbounded, but show the cursor only over notation.
    const last = this.#positions.at(-1)!;
    if (scoreTime >= last.time) {
      this.#cursor.hidden = true;
      return;
    }
    this.#cursor.hidden = false;

    // Locate the pair of playback anchors surrounding the current score time.
    let nextIndex = this.#positions.findIndex(
      (position) => position.time > scoreTime,
    );
    if (nextIndex < 1) {
      nextIndex = 1;
    }
    const previous = this.#positions[nextIndex - 1];
    const next = this.#positions[nextIndex];

    // Interpolate x by musical time while retaining the active system geometry.
    const progress =
      next.systemId === previous.systemId
        ? (scoreTime - previous.time) / (next.time - previous.time)
        : // Do not interpolate diagonally between wrapped systems. The synthetic
          // system endpoint completes the previous row before this direct jump.
          0;
    this.#cursor.style.transform = `translate(${previous.x + (next.x - previous.x) * progress}px, ${previous.top}px)`;
    this.#cursor.style.height = `${previous.height}px`;
    this.#cursor.dataset.systemId = String(previous.systemId);

    // Match MuseScore's containment behavior: keep the viewport fixed while
    // the complete cursor is visible, then reveal the active system.
    const cursorBottom = previous.top + previous.height;
    if (
      previous.top < this.#scroller.scrollTop ||
      cursorBottom > this.#scroller.scrollTop + this.#scroller.clientHeight
    ) {
      this.#scroller.scrollTo({ top: Math.max(previous.top - 24, 0) });
    }
  }

  #setState(update: Partial<ScoreViewerRuntimeState>) {
    this.#state = { ...this.#state, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function secondsToScoreTime(seconds: number, tempo: number) {
  return seconds * (tempo / 60 / 4);
}

function scoreTimeToSeconds(scoreTime: number, tempo: number) {
  return scoreTime / (tempo / 60 / 4);
}

function scoreTimeToBarBeat(scoreTime: number) {
  const totalBeats = Math.floor(scoreTime * 4);
  return {
    bar: Math.floor(totalBeats / 4) + 1,
    beat: (totalBeats % 4) + 1,
  };
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
  // OSMD has no high-level playback geometry API, so derive anchors from its
  // typed graphical model after rendering.
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

  // Add real anchors at rendered staff entries and their score timestamps.
  for (const container of osmd.GraphicSheet
    .VerticalGraphicalStaffEntryContainers) {
    const entry = container.getFirstNonNullStaffEntry();
    const system = entry?.parentMeasure.ParentMusicSystem;
    if (!entry || !system) {
      continue;
    }
    const topStaff = system.StaffLines[0];
    const bottomStaff = system.StaffLines.at(-1)!;
    // 20px padding above and below the system
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

  // Add a synthetic endpoint so the final note/rest interval can interpolate
  // from its last real anchor to the system's ending time and right border.
  const systems = osmd.GraphicSheet.MusicPages.flatMap(
    (page) => page.MusicSystems,
  );
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

// Temporary score-viewer transport matching the snapshot/subscription shape
// used by the existing Tone.js transport hook infrastructure.

type PlayheadSnapshot = {
  currentTime: number;
  paused: boolean;
};

class PlayheadClock {
  #snapshot: PlayheadSnapshot = { currentTime: 0, paused: true };
  #startedAt?: number;
  #frame?: number;
  readonly #listeners = new Set<() => void>();

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  play() {
    if (!this.#snapshot.paused) {
      return;
    }
    this.#startedAt = performance.now();
    this.#setSnapshot({ paused: false });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  pause() {
    if (this.#snapshot.paused) {
      return;
    }
    const currentTime =
      this.#snapshot.currentTime +
      (performance.now() - this.#startedAt!) / 1000;
    cancelAnimationFrame(this.#frame ?? 0);
    this.#frame = undefined;
    this.#startedAt = undefined;
    this.#setSnapshot({ currentTime, paused: true });
  }

  stop() {
    cancelAnimationFrame(this.#frame ?? 0);
    this.#frame = undefined;
    this.#startedAt = undefined;
    this.#setSnapshot({ currentTime: 0, paused: true });
  }

  seek(currentTime: number) {
    this.#startedAt = this.#snapshot.paused ? undefined : performance.now();
    this.#setSnapshot({ currentTime });
  }

  #tick = () => {
    if (this.#snapshot.paused || this.#startedAt === undefined) {
      return;
    }
    const currentTime =
      this.#snapshot.currentTime + (performance.now() - this.#startedAt) / 1000;
    this.#startedAt = performance.now();
    this.#setSnapshot({ currentTime });
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #setSnapshot(update: Partial<PlayheadSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
