import { expect, it } from "vitest";
import {
  createDefaultLegacySavedProject,
  normalizeLegacySavedProject,
} from "./project-store";

it("defaults old projects to unity gain", () => {
  const project = createDefaultLegacySavedProject();
  delete project.masterVolume;
  expect(normalizeLegacySavedProject(project).masterVolume).toBe(1);
});
