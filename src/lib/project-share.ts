import { z } from "zod";
import type { SerializedEditorRuntimeState } from "./persistence.ts";
import { routes } from "./routes.ts";
import {
  createMidiTrackState,
  type PersistableEditorRuntimeState,
} from "./runtime.ts";

// A share link carries a MIDI-only project in the URL fragment, so it never
// reaches a server and opens as an unsaved demo. The payload is the schema
// below as JSON, deflated and base64url-encoded.

const sharedProjectSchema = z.object({
  v: z.literal(1),
  title: z.string(),
  tempo: z.number(),
  timeSignature: z.tuple([z.number(), z.number()]),
  tracks: z.array(
    z.object({
      name: z.string(),
      bank: z.number().optional(),
      program: z.number(),
      gain: z.number(),
      pan: z.number(),
      /** `[pitch, start, duration, velocity]` per note. */
      notes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
    }),
  ),
});
type SharedProject = z.infer<typeof sharedProjectSchema>;

const PAYLOAD_PARAM = "p";

export async function createShareLink(
  state: PersistableEditorRuntimeState,
): Promise<string> {
  const url = new URL(routes.demo.href(), window.location.origin);
  url.hash = `${PAYLOAD_PARAM}=${await encodeSharedProject(state)}`;
  return url.href;
}

export function getSharePayload(url: string): string | undefined {
  return (
    new URLSearchParams(new URL(url).hash.slice(1)).get(PAYLOAD_PARAM) ??
    undefined
  );
}

export async function encodeSharedProject(
  state: PersistableEditorRuntimeState,
): Promise<string> {
  const shared: SharedProject = {
    v: 1,
    title: state.title,
    tempo: state.tempo,
    timeSignature: [
      state.timeSignature.numerator,
      state.timeSignature.denominator,
    ],
    tracks: state.midiTracks.map((track) => ({
      name: track.name,
      bank: track.bank,
      program: track.program,
      gain: track.gain,
      pan: track.pan,
      notes: track.notes.map((note) => [
        note.pitch,
        note.start,
        note.duration,
        note.velocity,
      ]),
    })),
  };
  const bytes = await transformBytes(
    new TextEncoder().encode(JSON.stringify(shared)),
    new CompressionStream("deflate-raw"),
  );
  return encodeBase64Url(bytes);
}

export async function decodeSharedProject(
  payload: string,
): Promise<SerializedEditorRuntimeState> {
  let shared: SharedProject;
  try {
    const bytes = await transformBytes(
      decodeBase64Url(payload),
      new DecompressionStream("deflate-raw"),
    );
    shared = sharedProjectSchema.parse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
  } catch {
    throw new Error("The share link does not hold a readable project.");
  }
  const [numerator, denominator] = shared.timeSignature;
  return {
    title: shared.title,
    tempo: shared.tempo,
    timeSignature: { numerator, denominator },
    audioTracks: [],
    midiTracks: shared.tracks.map((track) => ({
      ...createMidiTrackState({
        name: track.name,
        preset: { bank: track.bank, program: track.program },
      }),
      gain: track.gain,
      pan: track.pan,
      notes: track.notes.map(([pitch, start, duration, velocity]) => ({
        id: crypto.randomUUID(),
        pitch,
        start,
        duration,
        velocity,
      })),
    })),
  };
}

async function transformBytes(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function encodeBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
