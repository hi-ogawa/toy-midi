import { IdbStore } from "../idb.ts";
import {
  RECORDER_PROJECT_VERSION,
  type RecorderProjectContent,
  type SavedRecorderProject,
} from "./project.ts";

const CURRENT_PROJECT_ID = "current";

const projects = new IdbStore<SavedRecorderProject>({
  dbName: "toy-midi-recorder",
  storeName: "projects",
  version: 1,
  keyPath: "id",
});

export const recorderProjectStorage = {
  async load(): Promise<SavedRecorderProject | undefined> {
    const project = await projects.get(CURRENT_PROJECT_ID);
    if (project && project.version !== RECORDER_PROJECT_VERSION) {
      throw new Error(
        `Unsupported recorder project version: ${project.version}`,
      );
    }
    return project;
  },

  async save({
    title,
    content,
  }: {
    title: string;
    content: RecorderProjectContent;
  }): Promise<void> {
    await projects.put({
      ...content,
      id: CURRENT_PROJECT_ID,
      title,
      updatedAt: Date.now(),
    });
  },
};
