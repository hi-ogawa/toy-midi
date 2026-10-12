import type { SerializedEditorRuntimeState } from "./persistence.ts";
import { routes } from "./routes.ts";

// A share link carries the project, deflated and base64url-encoded, in the
// URL fragment. The browser never sends the fragment in a request, so the
// host's URL-length limit does not apply, and a whole song fits. It leaves out
// audio clips and the reference video, which need storage of their own.

// The fragment is keyed so a link can carry more than the project later.
const PAYLOAD_PARAM = "p";

export async function createShareLink(
  project: SerializedEditorRuntimeState,
): Promise<string> {
  const url = new URL(routes.demo.href(), window.location.origin);
  url.hash = `${PAYLOAD_PARAM}=${await encodeSharedProject(project)}`;
  return url.href;
}

export function getSharePayload(url: string): string | undefined {
  return (
    new URLSearchParams(new URL(url).hash.slice(1)).get(PAYLOAD_PARAM) ??
    undefined
  );
}

export async function encodeSharedProject(
  project: SerializedEditorRuntimeState,
): Promise<string> {
  const shared: SerializedEditorRuntimeState = {
    ...project,
    audioTracks: [],
    referenceVideo: undefined,
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
  try {
    const bytes = await transformBytes(
      decodeBase64Url(payload),
      new DecompressionStream("deflate-raw"),
    );
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("The share link does not hold a readable project.");
  }
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
