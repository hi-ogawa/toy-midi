import { IdbStore } from "../idb.ts";
import {
  RECORDER_PROJECT_VERSION,
  type RecorderProjectContent,
  type SavedRecorderProject,
} from "./project.ts";

export interface RecorderProjectMetadata {
  id: string;
  title: string;
  updatedAt: number;
}

const storeOptions = {
  dbName: "toy-midi-recorder",
  version: 2,
  keyPath: "id",
  storeNames: ["projects", "metadata"],
};

const projects = new IdbStore<SavedRecorderProject>({
  ...storeOptions,
  storeName: "projects",
});
const metadata = new IdbStore<RecorderProjectMetadata>({
  ...storeOptions,
  storeName: "metadata",
});

export const recorderProjectStorage = {
  async list(): Promise<RecorderProjectMetadata[]> {
    let result = await metadata.getAll();
    if (result.length === 0) {
      const legacyProjects = await projects.getAll();
      result = legacyProjects.map(toMetadata);
      await Promise.all(result.map((entry) => metadata.put(entry)));
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async create(): Promise<string> {
    const id = crypto.randomUUID();
    const project: SavedRecorderProject = {
      id,
      updatedAt: Date.now(),
      version: RECORDER_PROJECT_VERSION,
      title: "Untitled recording",
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
    };
    await projects.put(project);
    await metadata.put(toMetadata(project));
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
    content,
  }: {
    id: string;
    content: RecorderProjectContent;
  }): Promise<void> {
    const project: SavedRecorderProject = {
      ...content,
      id,
      updatedAt: Date.now(),
    };
    await projects.put(project);
    await metadata.put(toMetadata(project));
  },

  async delete(id: string): Promise<void> {
    await projects.delete(id);
    await metadata.delete(id);
  },
};

function toMetadata(project: SavedRecorderProject): RecorderProjectMetadata {
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
  };
}
