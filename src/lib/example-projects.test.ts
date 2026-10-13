import { inflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { EXAMPLE_PROJECTS } from "./example-projects";
import type { SharedProject } from "./project-share";

describe("example projects", () => {
  test("lists every share link file", () => {
    const files = Object.keys(import.meta.glob("../examples/*.txt"));
    expect(
      EXAMPLE_PROJECTS.map(({ id }) => `../examples/${id}.txt`).sort(),
    ).toEqual(files.sort());
  });

  // Decode directly, because `decodeSharedProject` pulls in the audio runtime,
  // which does not load outside a browser.
  test.for(EXAMPLE_PROJECTS)("$id holds a project", ({ href }) => {
    const payload = new URLSearchParams(href.split("#")[1]).get("p")!;
    const project: SharedProject = JSON.parse(
      inflateRawSync(Buffer.from(payload, "base64url")).toString(),
    );
    expect(project.midiTracks?.length).toBeGreaterThan(0);
  });
});
