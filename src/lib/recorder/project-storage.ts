import { IdbStore } from "../idb.ts";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";

interface StoredRecorderRuntimeState {
  id: string;
  updatedAt: number;
  content: SerializedRecorderRuntimeState;
}

export interface RecorderProjectMetadata {
  id: string;
  updatedAt: number;
  title: string;
}

const storeOptions = {
  dbName: "toy-midi-recorder",
  version: 3,
  keyPath: "id",
  storeNames: ["projects", "metadata"],
};

const projects = new IdbStore<StoredRecorderRuntimeState>({
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
    const project: StoredRecorderRuntimeState = {
      id,
      updatedAt: Date.now(),
      content: {
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
      },
    };
    await projects.put(project);
    await metadata.put(toMetadata(project));
    return id;
  },

  async load(id: string): Promise<SerializedRecorderRuntimeState> {
    const project = await projects.get(id);
    if (!project) {
      throw new Error(`Recorder project ${id} not found.`);
    }
    return project.content;
  },

  async save({
    id,
    content,
  }: {
    id: string;
    content: SerializedRecorderRuntimeState;
  }): Promise<void> {
    const project: StoredRecorderRuntimeState = {
      id,
      updatedAt: Date.now(),
      content,
    };
    await projects.put(project);
    await metadata.put(toMetadata(project));
  },

  async delete(id: string): Promise<void> {
    await projects.delete(id);
    await metadata.delete(id);
  },
};

function toMetadata(
  project: StoredRecorderRuntimeState,
): RecorderProjectMetadata {
  return {
    id: project.id,
    updatedAt: project.updatedAt,
    title: project.content.title,
  };
}
