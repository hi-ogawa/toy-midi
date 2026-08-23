import { IdbStore } from "../idb.ts";
import {
  RECORDER_PROJECT_VERSION,
  type RecorderProjectContent,
  type SavedRecorderProject,
} from "./project.ts";

const projects = new IdbStore<SavedRecorderProject>({
  dbName: "toy-midi-recorder",
  storeName: "projects",
  version: 1,
  keyPath: "id",
});

export const recorderProjectStorage = {
  async list(): Promise<SavedRecorderProject[]> {
    return (await projects.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async create(): Promise<string> {
    const id = crypto.randomUUID();
    await projects.put({
      id,
      title: "Untitled recording",
      updatedAt: Date.now(),
      version: RECORDER_PROJECT_VERSION,
      audioTracks: [],
      recordingTrack: {
        height: 96,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [],
      },
      latencyCompensation: 0,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
    });
    return id;
  },

  async load(id: string): Promise<SavedRecorderProject> {
    const project = await projects.get(id);
    if (!project) {
      throw new Error(`Recorder project ${id} not found.`);
    }
    if (project && project.version !== RECORDER_PROJECT_VERSION) {
      throw new Error(
        `Unsupported recorder project version: ${project.version}`,
      );
    }
    return project;
  },

  async save({
    id,
    title,
    content,
  }: {
    id: string;
    title: string;
    content: RecorderProjectContent;
  }): Promise<void> {
    await projects.put({
      ...content,
      id,
      title,
      updatedAt: Date.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await projects.delete(id);
  },
};
