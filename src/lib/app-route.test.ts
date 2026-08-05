import { describe, expect, it } from "vitest";
import { appPath, parseAppRoute } from "./app-route";

describe("appPath", () => {
  it("builds application paths", () => {
    expect(appPath.projects).toBe("/");
    expect(appPath.scoreViewer).toBe("/score-viewer");
    expect(appPath.project({ projectId: "project-id" })).toBe(
      "/project/project-id",
    );
    expect(appPath.projectScore({ projectId: "project-id" })).toBe(
      "/project/project-id/score",
    );
  });
});

describe("parseAppRoute", () => {
  it.each([
    ["/", { type: "projects" }],
    ["/score-viewer", { type: "score-viewer" }],
    ["/project/project-id", { type: "project", projectId: "project-id" }],
    [
      "/project/project-id/score",
      { type: "project-score", projectId: "project-id" },
    ],
  ])("parses %s", (pathname, expected) => {
    expect(parseAppRoute(pathname)).toEqual(expected);
  });

  it.each([
    "/unknown",
    "/score-viewer/",
    "/project/",
    "/project/project-id/",
    "/project/project-id/score/extra",
  ])("falls back to projects for %s", (pathname) => {
    expect(parseAppRoute(pathname)).toEqual({ type: "projects" });
  });
});
