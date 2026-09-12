import { IdbStore } from "../idb.ts";
import {
  type SerializedRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import {
  migrateRecorderProject,
  type SerializedRecorderRuntimeStateV1,
} from "./project-migration.ts";
import { createDefaultRecorderRuntimeState } from "./runtime.ts";

type StoredRecorderProject = {
  id: string;
  updatedAt: number;
} & (
  | { version: 2; content: SerializedRecorderRuntimeState }
  | { version?: undefined; content: SerializedRecorderRuntimeStateV1 }
);

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
    return this.createWithContent(
      serializeRecorderRuntimeState(createDefaultRecorderRuntimeState()),
    );
  },

  async createWithContent(
    content: SerializedRecorderRuntimeState,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const project: StoredRecorderProject = {
      version: 2,
      id,
      updatedAt: Date.now(),
      content,
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
    switch (project.version) {
      case undefined: {
        return migrateRecorderProject(project.content);
      }
      case 2: {
        return project.content;
      }
      default: {
        throw new Error("Recorder project requires a newer app version.");
      }
    }
  },

  async save({
    id,
    content,
  }: {
    id: string;
    content: SerializedRecorderRuntimeState;
  }): Promise<void> {
    const project: StoredRecorderProject = {
      version: 2,
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
