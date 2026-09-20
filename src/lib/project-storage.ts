import { IdbStore } from "./idb.ts";
import {
  type SerializedRuntimeState,
  serializeRuntimeState,
} from "./persistence.ts";
import { createDefaultRuntimeState } from "./runtime.ts";

interface StoredProject {
  id: string;
  updatedAt: number;
  content: SerializedRuntimeState;
}

export interface ProjectMetadata {
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

const projects = new IdbStore<StoredProject>({
  ...storeOptions,
  storeName: "projects",
});
const metadata = new IdbStore<ProjectMetadata>({
  ...storeOptions,
  storeName: "metadata",
});

export const projectStorage = {
  async list(): Promise<ProjectMetadata[]> {
    return (await metadata.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async create(): Promise<string> {
    return this.createWithContent(
      serializeRuntimeState(createDefaultRuntimeState()),
    );
  },

  async createWithContent(content: SerializedRuntimeState): Promise<string> {
    const id = crypto.randomUUID();
    const project: StoredProject = {
      id,
      updatedAt: Date.now(),
      content,
    };
    await projects.put(project);
    await metadata.put(toMetadata(project));
    return id;
  },

  async load(id: string): Promise<SerializedRuntimeState> {
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
    content: SerializedRuntimeState;
  }): Promise<void> {
    const project: StoredProject = {
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

function toMetadata(project: StoredProject): ProjectMetadata {
  return {
    id: project.id,
    updatedAt: project.updatedAt,
    title: project.content.title,
  };
}
