import { IdbStore } from "../idb.ts";
import {
  type SerializedRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import { createDefaultRecorderRuntimeState } from "./runtime.ts";

interface StoredRecorderProject {
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

const projects = new IdbStore<StoredRecorderProject>({
  ...storeOptions,
  storeName: "projects",
});
const metadata = new IdbStore<RecorderProjectMetadata>({
  ...storeOptions,
  storeName: "metadata",
});

export const recorderProjectStorage = {
  async list(): Promise<RecorderProjectMetadata[]> {
    return (await metadata.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async create(): Promise<string> {
    const id = crypto.randomUUID();
    const project: StoredRecorderProject = {
      id,
      updatedAt: Date.now(),
      content: serializeRecorderRuntimeState(
        createDefaultRecorderRuntimeState(),
      ),
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
    const project: StoredRecorderProject = {
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

function toMetadata(project: StoredRecorderProject): RecorderProjectMetadata {
  return {
    id: project.id,
    updatedAt: project.updatedAt,
    title: project.content.title,
  };
}
