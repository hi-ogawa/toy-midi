// Persistence facade for all project storage.
//
// Assets are keyed by source file (name + size + lastModified), so the same
// file imported into multiple projects shares one asset; delete() does NOT
// remove assets referenced by the deleted project (no garbage collection).

import {
  type AnySavedProject,
  createDefaultSavedProject,
  migrateSavedProject,
  type SavedProject,
  type SavedProjectV1,
} from "../stores/project-store";
import { IdbStore } from "./idb";

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredAsset {
  key: string;
  blob: Blob;
  name: string;
  size: number;
  type: string;
  addedAt: number;
}

// versioned main entry: project metadata list (cheap enumeration for the
// list view) + last opened project pointer
interface MainEntry {
  version: 1;
  projects: ProjectMetadata[];
  lastProjectId: string | null;
}

const MAIN_KEY = "toy-midi-main";
// legacy unversioned keys, folded into the main entry on first read
const LEGACY_PROJECT_LIST_KEY = "toy-midi-project-list";
const LEGACY_LAST_PROJECT_ID_KEY = "toy-midi-last-project-id";
// saved project, one localStorage entry per project
const PROJECT_KEY_PREFIX = "toy-midi-project-";

class ProjectStorage {
  private readMain(): MainEntry {
    const json = localStorage.getItem(MAIN_KEY);
    if (json) {
      // future versions: migrate here, like migrateSavedProject
      return JSON.parse(json) as MainEntry;
    }

    const legacyList = localStorage.getItem(LEGACY_PROJECT_LIST_KEY);
    const legacyLastProjectId = localStorage.getItem(
      LEGACY_LAST_PROJECT_ID_KEY,
    );
    if (legacyList !== null || legacyLastProjectId !== null) {
      const entry: MainEntry = {
        version: 1,
        projects: legacyList
          ? (JSON.parse(legacyList) as ProjectMetadata[])
          : [],
        lastProjectId: legacyLastProjectId,
      };
      this.writeMain(entry);
      localStorage.removeItem(LEGACY_PROJECT_LIST_KEY);
      localStorage.removeItem(LEGACY_LAST_PROJECT_ID_KEY);
      return entry;
    }

    return { version: 1, projects: [], lastProjectId: null };
  }

  private writeMain(entry: MainEntry): void {
    localStorage.setItem(MAIN_KEY, JSON.stringify(entry));
  }

  listMetadata(): ProjectMetadata[] {
    return this.readMain().projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getMetadata(projectId: string): ProjectMetadata | null {
    return this.listMetadata().find((p) => p.id === projectId) || null;
  }

  createNew(): string {
    return this.create(
      this.getDefaultProjectName(),
      createDefaultSavedProject(),
    );
  }

  create(name: string, data: SavedProject): string {
    const projectId = generateProjectId();
    const now = Date.now();
    const metadata: ProjectMetadata = {
      id: projectId,
      name,
      createdAt: now,
      updatedAt: now,
    };

    const entry = this.readMain();
    entry.projects.push(metadata);
    this.writeMain(entry);

    this.save(projectId, data);
    return projectId;
  }

  updateMetadata(
    projectId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
  ): void {
    const entry = this.readMain();
    const position = entry.projects.findIndex((p) => p.id === projectId);
    if (position === -1) {
      throw new Error(`Project ${projectId} not found`);
    }

    entry.projects[position] = {
      ...entry.projects[position],
      ...updates,
    };
    this.writeMain(entry);
  }

  delete(projectId: string): void {
    const entry = this.readMain();
    entry.projects = entry.projects.filter((p) => p.id !== projectId);
    if (entry.lastProjectId === projectId) {
      entry.lastProjectId = null;
    }
    this.writeMain(entry);

    localStorage.removeItem(getProjectKey(projectId));
  }

  private getDefaultProjectName(): string {
    const untitledCount = this.listMetadata().filter((p) =>
      p.name.match(/^Untitled( \d+)?$/),
    ).length;

    return untitledCount === 0 ? "Untitled" : `Untitled ${untitledCount + 1}`;
  }

  load(projectId: string): SavedProject {
    const json = localStorage.getItem(getProjectKey(projectId));
    if (!json) {
      throw new Error(`Project ${projectId} not found in storage`);
    }
    return migrateSavedProject(JSON.parse(json) as AnySavedProject);
  }

  save(projectId: string, data: SavedProject): void {
    localStorage.setItem(getProjectKey(projectId), JSON.stringify(data));
    this.updateMetadata(projectId, { updatedAt: Date.now() });
  }

  getLastProjectId(): string | null {
    return this.readMain().lastProjectId;
  }

  setLastProjectId(projectId: string): void {
    const entry = this.readMain();
    entry.lastProjectId = projectId;
    this.writeMain(entry);
  }

  // binary audio assets
  private assetStore = new IdbStore<StoredAsset>({
    dbName: "toy-midi",
    storeName: "assets",
    version: 1,
    keyPath: "key",
  });

  async saveAsset(file: File): Promise<string> {
    const key = generateAssetKey(file);
    await this.assetStore.put({
      key,
      blob: file,
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: Date.now(),
    });
    return key;
  }

  async loadAsset(key: string): Promise<StoredAsset | null> {
    return this.assetStore.get(key);
  }

  async deleteAsset(key: string): Promise<void> {
    return this.assetStore.delete(key);
  }
}

export const projectStorage = new ProjectStorage();

function generateProjectId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `project-${crypto.randomUUID()}`;
  }
  return `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getProjectKey(projectId: string): string {
  return `${PROJECT_KEY_PREFIX}${projectId}`;
}

function generateAssetKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

// e2e-only: seed the legacy split-key storage format to test main entry migration
export function seedLegacyProjectKeys(
  metadata: ProjectMetadata,
  project: AnySavedProject,
): void {
  localStorage.setItem(LEGACY_PROJECT_LIST_KEY, JSON.stringify([metadata]));
  localStorage.setItem(LEGACY_LAST_PROJECT_ID_KEY, metadata.id);
  localStorage.setItem(getProjectKey(metadata.id), JSON.stringify(project));
}

// e2e-only: seed an old-schema project to test migration on load
export async function seedProjectV1(
  name: string,
  project: SavedProjectV1,
  audioData: Uint8Array<ArrayBuffer>,
): Promise<void> {
  if (!project.audioFileName) {
    throw new Error("Cannot seed v1 project without audio file name");
  }

  const file = new File([audioData], project.audioFileName, {
    type: "audio/wav",
  });
  const assetKey = await projectStorage.saveAsset(file);

  project = { ...project, audioAssetKey: assetKey };
  const projectId = projectStorage.create(name, project as any);
  projectStorage.setLastProjectId(projectId);
}
