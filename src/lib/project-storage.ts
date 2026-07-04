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

// project metadata list (cheap enumeration for the list view)
const PROJECT_LIST_KEY = "toy-midi-project-list";
// last opened project pointer
const LAST_PROJECT_ID_KEY = "toy-midi-last-project-id";
// project document, one localStorage entry per project
const PROJECT_KEY_PREFIX = "toy-midi-project-";

// binary audio assets
const DB_NAME = "toy-midi";
const DB_VERSION = 1;
const STORE_NAME = "assets";

class ProjectStorage {
  listMetadata(): ProjectMetadata[] {
    const json = localStorage.getItem(PROJECT_LIST_KEY);
    if (!json) {
      return [];
    }
    const list = JSON.parse(json) as ProjectMetadata[];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
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

    const projects = this.listMetadata();
    projects.push(metadata);

    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
    this.save(projectId, data);
    return projectId;
  }

  updateMetadata(
    projectId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
  ): void {
    const projects = this.listMetadata();
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) {
      throw new Error(`Project ${projectId} not found`);
    }

    projects[index] = {
      ...projects[index],
      ...updates,
    };

    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
  }

  delete(projectId: string): void {
    const projects = this.listMetadata();
    const filtered = projects.filter((p) => p.id !== projectId);

    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(filtered));
    localStorage.removeItem(getProjectKey(projectId));

    if (this.getLastProjectId() === projectId) {
      localStorage.removeItem(LAST_PROJECT_ID_KEY);
    }
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
    this.setLastProjectId(projectId);
  }

  getLastProjectId(): string | null {
    return localStorage.getItem(LAST_PROJECT_ID_KEY);
  }

  setLastProjectId(projectId: string): void {
    localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
  }

  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => {
        console.warn("IndexedDB blocked - close other tabs?");
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
    });

    return this.dbPromise;
  }

  async saveAsset(file: File): Promise<string> {
    const db = await this.openDB();
    const key = generateAssetKey(file);

    const asset: StoredAsset = {
      key,
      blob: file,
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(asset);

      request.onsuccess = () => resolve(key);
      request.onerror = () => reject(request.error);
    });
  }

  async loadAsset(key: string): Promise<StoredAsset | null> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAsset(key: string): Promise<void> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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
  projectStorage.create(name, project as any);
}
