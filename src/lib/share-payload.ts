import type { SharedProject } from "./project-share.ts";

// Kept apart from the project mapping, which needs the runtime, so tests can
// write share links without loading it.

/** Encodes a shared project as a share link's payload. */
export async function encodeSharePayload(
  project: SharedProject,
): Promise<string> {
  const bytes = await transformBytes(
    new TextEncoder().encode(JSON.stringify(project)),
    new CompressionStream("deflate-raw"),
  );
  return encodeBase64Url(bytes);
}

/** Decodes a share link's payload, throwing on anything unreadable. */
export async function decodeSharePayload(
  payload: string,
): Promise<SharedProject> {
  const bytes = await transformBytes(
    decodeBase64Url(payload),
    new DecompressionStream("deflate-raw"),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
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
