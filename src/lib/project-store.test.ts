import { expect, it } from "vitest";
import { createDefaultSavedProject, fromSavedProject } from "./project-store";

it("defaults old projects to unity gain", () => {
  const project = createDefaultSavedProject();
  delete project.masterVolume;
  expect(fromSavedProject(project).masterVolume).toBe(1);
});
