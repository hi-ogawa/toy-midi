import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { SCORE_VIEWER_SAMPLES } from "../lib/score-viewer-samples";
import { DEFAULT_TIME_SIGNATURE, type TimeSignature } from "../types";

type ScoreViewerRuntimeState = {
  bar: number;
  beat: number;
  currentTime: number;
  isPlaying: boolean;
  isReady: boolean;
  tempo: number;
};

const INITIAL_RUNTIME_STATE: ScoreViewerRuntimeState = {
  bar: 1,
  beat: 1,
  currentTime: 0,
  isPlaying: false,
  isReady: false,
  tempo: SCORE_VIEWER_SAMPLES[0].tempo,
};

export type ScoreLayout = "continuous" | "paged";

export type ScoreViewerSettings = {
  layout: ScoreLayout;
  showSectionLabels: boolean;
  showTitle: boolean;
  titleSpacing: number;
};

export const INITIAL_SCORE_VIEWER_SETTINGS: ScoreViewerSettings = {
  layout: "continuous",
  showSectionLabels: true,
  showTitle: true,
  titleSpacing: 0,
};

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
  //       <measureLayers />
  //       <container />
  //     </sheet>
  //   </scroller>
  // </root>
  #root!: HTMLDivElement;
  #container!: HTMLDivElement;
  #cursor!: HTMLDivElement;
  #measureLayers!: HTMLDivElement;
  #scroller!: HTMLElement;
  #sheet!: HTMLDivElement;

  #osmd!: OpenSheetMusicDisplay;

  #positions: CursorPosition[] = [];
  #state = INITIAL_RUNTIME_STATE;
  #timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE;
  readonly #listeners = new Set<() => void>();

  readonly #clock: ScoreViewerClock;

  constructor({ clock }: { clock: ScoreViewerClock }) {
    this.#clock = clock;
    this.#clock.subscribe(() => {
      const { currentTime, isPlaying } = this.#clock.getSnapshot();
      const scoreTime = secondsToScoreTime(currentTime, this.#state.tempo);
      const { bar, beat } = scoreTimeToBarBeat(scoreTime, this.#timeSignature);
      if (
        bar !== this.#state.bar ||
        beat !== this.#state.beat ||
        currentTime !== this.#state.currentTime
      ) {
        this.#setState({ bar, beat, currentTime });
      }
      this.#updateCursor(scoreTime);
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
    this.#sheet.dataset.testid = "score-viewer-sheet";
    this.#sheet.className = "relative mx-auto";
    this.#sheet.hidden = true;
    this.#sheet.style.width = `${SCORE_LAYOUT_WIDTH}px`;

    this.#cursor = document.createElement("div");
    this.#cursor.dataset.testid = "score-viewer-cursor";
    this.#cursor.className =
      "pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-blue-500";

    this.#measureLayers = document.createElement("div");
    this.#measureLayers.dataset.testid = "score-viewer-measure-layers";
    this.#measureLayers.className = "absolute inset-0 z-[5]";
    this.#measureLayers.addEventListener("click", this.#handleMeasureClick);

    this.#container = document.createElement("div");
    this.#container.dataset.testid = "score-viewer-renderer";
    this.#container.style.width = `${SCORE_LAYOUT_WIDTH}px`;

    this.#sheet.append(this.#cursor, this.#measureLayers, this.#container);
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

  async load({
    score,
    settings,
  }: {
    score: ScoreSource;
    settings: ScoreViewerSettings;
  }) {
    this.#clock.stop();
    this.#setState({ isReady: false });

    this.#osmd.clear();
    applyEngravingSettings(this.#osmd, settings);
    await this.#osmd.load(score.xml);
    this.#sheet.hidden = false;
    this.#osmd.render();

    this.#sheet.className =
      settings.layout === "continuous"
        ? "relative mx-auto bg-white px-4 shadow-xl"
        : "relative mx-auto";
    this.#positions = buildCursorPositions(this.#osmd, this.#container);
    buildMeasureTargets(this.#osmd, this.#measureLayers, this.#container);
    this.#timeSignature = parseTimeSignature(score.xml);
    this.#clock.stop();
    this.#setState({
      bar: 1,
      beat: 1,
      currentTime: 0,
      isReady: true,
      tempo: parseTempo(score.xml),
    });
    this.#updateCursor(0);
  }

  togglePlayback() {
    if (this.#clock.getSnapshot().isPlaying) {
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
    this.#measureLayers.removeEventListener("click", this.#handleMeasureClick);
    if (this.#root.hasChildNodes()) {
      this.#osmd.clear();
      this.#root.replaceChildren();
    }
  }

  #handleMeasureClick = (event: MouseEvent) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-score-time]",
    );
    if (!target) {
      return;
    }
    this.seek(Number(target.dataset.scoreTime));
  };

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
    const currentAnchor = this.#positions[nextIndex - 1];
    const nextAnchor = this.#positions[nextIndex];

    // Interpolate x by musical time while retaining the active system geometry.
    const progress =
      nextAnchor.systemId === currentAnchor.systemId
        ? (scoreTime - currentAnchor.time) /
          (nextAnchor.time - currentAnchor.time)
        : // Do not interpolate diagonally between wrapped systems. The synthetic
          // system endpoint completes the previous row before this direct jump.
          0;
    this.#cursor.style.transform = `translate(${currentAnchor.x + (nextAnchor.x - currentAnchor.x) * progress}px, ${currentAnchor.top}px)`;
    this.#cursor.style.height = `${currentAnchor.height}px`;
    // Expose the active system for cursor-wrapping E2E coverage.
    this.#cursor.dataset.systemId = String(currentAnchor.systemId);

    // Match MuseScore's containment behavior: keep the viewport fixed while
    // the complete cursor is visible, then reveal the active system.
    const cursorTop = currentAnchor.top;
    const cursorBottom = cursorTop + currentAnchor.height;
    const viewportTop = this.#scroller.scrollTop;
    const viewportBottom = viewportTop + this.#scroller.clientHeight;
    if (cursorTop < viewportTop || viewportBottom < cursorBottom) {
      this.#scroller.scrollTo({ top: Math.max(cursorTop - 24, 0) });
    }
  }

  #setState(update: Partial<ScoreViewerRuntimeState>) {
    this.#state = { ...this.#state, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function applyEngravingSettings(
  osmd: OpenSheetMusicDisplay,
  settings: ScoreViewerSettings,
) {
  osmd.setPageFormat(settings.layout === "paged" ? "A4_P" : "Endless");
  osmd.setOptions({ drawTitle: settings.showTitle });
  osmd.EngravingRules.RenderRehearsalMarks = settings.showSectionLabels;
  osmd.EngravingRules.TitleBottomDistance = settings.titleSpacing;
}

function secondsToScoreTime(seconds: number, tempo: number) {
  return seconds * (tempo / 60 / 4);
}

function scoreTimeToSeconds(scoreTime: number, tempo: number) {
  return scoreTime / (tempo / 60 / 4);
}

function scoreTimeToBarBeat(
  scoreTime: number,
  { numerator, denominator }: TimeSignature,
) {
  const measureDuration = numerator / denominator;
  const bar = Math.floor(scoreTime / measureDuration);
  return {
    bar: bar + 1,
    beat: Math.floor((scoreTime - bar * measureDuration) * denominator) + 1,
  };
}

function parseTimeSignature(xml: string): TimeSignature {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const time = document.querySelector(
    "part:first-of-type > measure > attributes > time",
  );
  const numerator = Number(time?.querySelector("beats")?.textContent);
  const denominator = Number(time?.querySelector("beat-type")?.textContent);
  if (
    Number.isFinite(numerator) &&
    numerator > 0 &&
    Number.isFinite(denominator) &&
    denominator > 0
  ) {
    return { numerator, denominator };
  }
  return DEFAULT_TIME_SIGNATURE;
}

function parseTempo(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const value = Number(
    document.querySelector("sound[tempo]")?.getAttribute("tempo") ??
      document.querySelector("metronome per-minute")?.textContent,
  );
  return Number.isFinite(value) && value > 0 ? value : 120;
}

function buildCursorPositions(
  osmd: OpenSheetMusicDisplay,
  container: HTMLDivElement,
): CursorPosition[] {
  // TODO: Define how simultaneous entries at one timestamp map to a single
  // cursor anchor before MusicXML chord or multi-voice support is added.
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
  // Each paged backend reports page-local score geometry. Match graphical
  // pages to their rendered DOM pages to convert cursor y positions to the
  // shared container coordinate space.
  const containerBounds = container.getBoundingClientRect();
  const pageElements = container.querySelectorAll<HTMLElement>(
    ':scope > [id^="osmdCanvasPage"]',
  );
  const pageOffsets = new Map(
    osmd.GraphicSheet.MusicPages.map((page, index) => [
      page,
      (pageElements[index]?.getBoundingClientRect().top ??
        containerBounds.top) - containerBounds.top,
    ]),
  );

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
    const pageTop = pageOffsets.get(system.Parent) ?? 0;
    // 20px padding above and below the system
    const top =
      pageTop + topStaff.PositionAndShape.AbsolutePosition.y * 10 - 20;
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

// OSMD does not render measure-level hit targets. Build transparent overlays
// from its graphical measures so each target spans the full system height.
function buildMeasureTargets(
  osmd: OpenSheetMusicDisplay,
  layers: HTMLDivElement,
  container: HTMLDivElement,
) {
  const sheetBounds = layers.parentElement!.getBoundingClientRect();
  const pageElements = container.querySelectorAll<HTMLElement>(
    ':scope > [id^="osmdCanvasPage"]',
  );
  const pageLayers: HTMLDivElement[] = [];
  for (const [pageIndex, page] of osmd.GraphicSheet.MusicPages.entries()) {
    const pageElement = pageElements[pageIndex];
    if (!pageElement) {
      continue;
    }
    const pageBounds = pageElement.getBoundingClientRect();
    const pageLayer = document.createElement("div");
    pageLayer.className = "absolute";
    pageLayer.style.left = `${pageBounds.left - sheetBounds.left}px`;
    pageLayer.style.top = `${pageBounds.top - sheetBounds.top}px`;
    pageLayer.style.width = `${pageBounds.width}px`;
    pageLayer.style.height = `${pageBounds.height}px`;

    for (const system of page.MusicSystems) {
      for (const measures of system.GraphicalMeasures) {
        const measure = measures.find((candidate) => candidate?.isVisible());
        if (!measure) {
          continue;
        }

        const topStaff = system.StaffLines[0];
        const bottomStaff = system.StaffLines.at(-1)!;
        const target = document.createElement("div");
        // Expose the target and its source-measure identity for E2E interaction.
        target.dataset.testid = "score-viewer-measure";
        target.dataset.measureIndex = String(
          measure.parentSourceMeasure.measureListIndex,
        );
        // Store OSMD whole-note time on the target for delegated click seeking.
        target.dataset.scoreTime = String(
          measure.parentSourceMeasure.AbsoluteTimestamp.RealValue,
        );
        target.className =
          "absolute cursor-pointer bg-transparent hover:bg-blue-500/10";
        const measureIndex = system.GraphicalMeasures.indexOf(measures);
        const nextMeasure = system.GraphicalMeasures[measureIndex + 1]?.find(
          (candidate) => candidate?.isVisible(),
        );
        const left = measure.PositionAndShape.AbsolutePosition.x * 10;
        const right =
          nextMeasure?.PositionAndShape.AbsolutePosition.x !== undefined
            ? nextMeasure.PositionAndShape.AbsolutePosition.x * 10
            : system.GetRightBorderAbsoluteXPosition() * 10;
        // Extend 20px above and below the staves for an easier full-system hit target.
        const top = topStaff.PositionAndShape.AbsolutePosition.y * 10 - 20;
        const bottom =
          (bottomStaff.PositionAndShape.AbsolutePosition.y +
            bottomStaff.StaffHeight) *
            10 +
          20;
        target.style.left = `${left}px`;
        target.style.top = `${top}px`;
        target.style.width = `${right - left}px`;
        target.style.height = `${bottom - top}px`;
        pageLayer.append(target);
      }
    }
    pageLayers.push(pageLayer);
  }
  layers.replaceChildren(...pageLayers);
}

// Temporary score-viewer transport matching the snapshot/subscription shape
// used by the existing Tone.js transport hook infrastructure.

export type ScoreViewerClock = {
  getSnapshot: () => PlayheadSnapshot;
  subscribe: (listener: () => void) => () => void;
  seek: (currentTime: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
};

type PlayheadSnapshot = {
  currentTime: number;
  isPlaying: boolean;
};

export class PlayheadClock implements ScoreViewerClock {
  #snapshot: PlayheadSnapshot = { currentTime: 0, isPlaying: false };
  #startedAt?: number;
  #frame?: number;
  readonly #listeners = new Set<() => void>();

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  play() {
    if (this.#snapshot.isPlaying) {
      return;
    }
    this.#startedAt = performance.now();
    this.#setSnapshot({ isPlaying: true });
    this.#frame = requestAnimationFrame(this.#tick);
  }

  pause() {
    if (!this.#snapshot.isPlaying) {
      return;
    }
    const currentTime =
      this.#snapshot.currentTime +
      (performance.now() - this.#startedAt!) / 1000;
    cancelAnimationFrame(this.#frame ?? 0);
    this.#frame = undefined;
    this.#startedAt = undefined;
    this.#setSnapshot({ currentTime, isPlaying: false });
  }

  stop() {
    cancelAnimationFrame(this.#frame ?? 0);
    this.#frame = undefined;
    this.#startedAt = undefined;
    this.#setSnapshot({ currentTime: 0, isPlaying: false });
  }

  seek(currentTime: number) {
    this.#startedAt = this.#snapshot.isPlaying ? performance.now() : undefined;
    this.#setSnapshot({ currentTime });
  }

  #tick = () => {
    if (!this.#snapshot.isPlaying || this.#startedAt === undefined) {
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
