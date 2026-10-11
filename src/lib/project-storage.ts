import { createAvailableName } from "../utils/name.ts";
import { IdbStore } from "./idb.ts";
import {
  type SerializedEditorRuntimeState,
  serializeEditorRuntimeState,
} from "./persistence.ts";
import { createDefaultEditorRuntimeState } from "./runtime.ts";

interface StoredProject {
  id: string;
  updatedAt: number;
  content: SerializedEditorRuntimeState;
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
    const state = createDefaultEditorRuntimeState();
    state.title = createAvailableName({
      names: (await this.list()).map((project) => project.title),
      baseName: state.title,
    });
    return this.createWithContent(serializeEditorRuntimeState(state));
  },

  async createWithContent(
    content: SerializedEditorRuntimeState,
  ): Promise<string> {
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

  async load(id: string): Promise<SerializedEditorRuntimeState> {
    const project = await projects.get(id);
    if (!project) {
      throw new Error(`Project ${id} not found.`);
    }
    return project.content;
  },

  async save({
    id,
    content,
  }: {
    id: string;
    content: SerializedEditorRuntimeState;
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
