import type { Note } from "../types.ts";
import type {
  MultibandEqBand,
  MultibandEqParameters,
} from "./dsp/biquad-eq-multiband.ts";
import type {
  SerializedEditorRuntimeState,
  SerializedMidiTrackState,
} from "./persistence.ts";
import { routes } from "./routes.ts";
import {
  createMidiTrackState,
  type Locator,
  MIN_TRACK_HEIGHT,
} from "./runtime.ts";
import { decodeSharePayload, encodeSharePayload } from "./share-payload.ts";

// A share link carries the project, deflated and base64url-encoded, in the
// URL fragment. The browser never sends the fragment in a request, so the
// host's URL-length limit does not apply, and a whole song fits. It leaves out
// audio clips, whose samples need storage of their own. It also leaves out
// ids, which are random text that does not compress and would otherwise make
// up most of the link, and generates fresh ones when the link opens.

// The fragment is keyed so a link can carry more than the project later.
const PAYLOAD_PARAM = "p";

const SOURCE_PARAM = "src";

export async function createShareLink(
  project: SerializedEditorRuntimeState,
): Promise<string> {
  const url = new URL(routes.draft.href(), window.location.origin);
  url.hash = `${PAYLOAD_PARAM}=${await encodeSharePayload(omitIds(project))}`;
  return url.href;
}

/**
 * The project a share link carries: the saved format without audio tracks,
 * track order, or ids. Tracks appear in the order of `midiTracks`, the app
 * generates ids when the link opens, and optional fields fill in defaults when
 * the project loads. Tracks without `viewMode` or `height` open collapsed.
 */
export interface SharedProject extends Omit<
  SerializedEditorRuntimeState,
  "audioTracks" | "trackOrder" | "midiTracks" | "locators"
> {
  locators?: Omit<Locator, "id">[];
  midiTracks?: SharedMidiTrack[];
}

interface SharedMidiTrack
  extends
    Pick<SerializedMidiTrackState, "name" | "program">,
    Partial<
      Omit<SerializedMidiTrackState, "id" | "name" | "program" | "notes" | "eq">
    > {
  notes: Omit<Note, "id">[];
  eq?: Omit<MultibandEqParameters, "bands"> & {
    bands: Omit<MultibandEqBand, "id">[];
  };
}

export function getSharePayload(url: string): string | undefined {
  return (
    new URLSearchParams(new URL(url).hash.slice(1)).get(PAYLOAD_PARAM) ??
    undefined
  );
}

export function getShareSource(url: string): string | undefined {
  return new URL(url).searchParams.get(SOURCE_PARAM) ?? undefined;
}

export async function fetchSharedProject(
  src: string,
): Promise<SerializedEditorRuntimeState> {
  let response: Response;
  try {
    response = await fetch(src);
  } catch {
    throw new Error(`Could not fetch the project from ${src}.`);
  }
  if (!response.ok) {
    throw new Error(
      `Could not fetch the project from ${src} (HTTP ${response.status}).`,
    );
  }
  try {
    return assignIds(await response.json());
  } catch {
    throw new Error(`${src} does not hold a readable project.`);
  }
}

export async function decodeSharedProject(
  payload: string,
): Promise<SerializedEditorRuntimeState> {
  try {
    return assignIds(await decodeSharePayload(payload));
  } catch {
    throw new Error("The share link does not hold a readable project.");
  }
}

function omitIds({
  audioTracks: _audioTracks,
  trackOrder: _trackOrder,
  locators,
  midiTracks,
  ...project
}: SerializedEditorRuntimeState): SharedProject {
  return {
    ...project,
    locators: locators?.map(({ id: _id, ...locator }) => locator),
    midiTracks: midiTracks?.map(({ id: _id, notes, eq, ...track }) => ({
      ...track,
      notes: notes.map(({ id: _id, ...note }) => note),
      eq: { ...eq, bands: eq.bands.map(({ id: _id, ...band }) => band) },
    })),
  };
}

function assignIds(project: SharedProject): SerializedEditorRuntimeState {
  return {
    ...project,
    audioTracks: [],
    locators: project.locators?.map((locator) => ({
      ...locator,
      id: crypto.randomUUID(),
    })),
    midiTracks: project.midiTracks?.map(({ notes, eq, ...track }) => ({
      ...createMidiTrackState({ name: track.name, preset: track }),
      // Collapse tracks so a whole arrangement fits on screen when it opens.
      viewMode: "overview",
      height: MIN_TRACK_HEIGHT,
      ...track,
      notes: notes.map((note) => ({ ...note, id: crypto.randomUUID() })),
      ...(eq && {
        eq: {
          ...eq,
          bands: eq.bands.map((band) => ({ ...band, id: crypto.randomUUID() })),
        },
      }),
    })),
  };
}
