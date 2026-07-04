// Persistence facade for all project storage.
//
// Storage map:
// - localStorage "toy-midi-project-list": project metadata (cheap enumeration for list view)
// - localStorage "toy-midi-project-<id>": full project document (notes, tracks, settings)
// - localStorage "toy-midi-last-project-id": last opened project pointer
// - IndexedDB "toy-midi" / "assets": binary audio assets, keyed by
//   file name + size + lastModified
// - Zustand store (project-store): the open document in memory — never storage
//
// Invariants:
// - A project = document + metadata entry (metadata is the cheap-enumeration
//   index for the list view). create() writes both; delete() removes both, so
//   every listed project has a loadable document.
// - load() migrates old document versions and returns the current schema.
// - Asset keys are derived from the source file, so the same file imported into
//   multiple projects shares one asset; delete() does NOT remove assets
//   referenced by the deleted project (no garbage collection).
// - save() also bumps updatedAt and lastProjectId.

import {
  type AnySavedProject,
  migrateSavedProject,
  type SavedProject,
  type SavedProjectV1,
} from "../stores/project-store";

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

interface StoredAsset {
  key: string;
  blob: Blob;
  name: string;
  size: number;
  type: string;
  addedAt: number; // timestamp
}

const PROJECT_LIST_KEY = "toy-midi-project-list";
const LAST_PROJECT_ID_KEY = "toy-midi-last-project-id";

const DB_NAME = "toy-midi";
const DB_VERSION = 1;
const STORE_NAME = "assets";

class ProjectStorage {
  // === metadata — localStorage "toy-midi-project-list" ===

  // List all projects, sorted by updatedAt descending (most recent first)
  list(): ProjectMetadata[] {
    const json = localStorage.getItem(PROJECT_LIST_KEY);
    if (!json) {
      return [];
    }
    const list = JSON.parse(json) as ProjectMetadata[];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getMetadata(projectId: string): ProjectMetadata | null {
    return this.list().find((p) => p.id === projectId) || null;
  }

  // Create new project (metadata entry + initial document), returns its ID
  create(name: string | undefined, data: SavedProject): string {
    const projectId = generateProjectId();
    const now = Date.now();
    const metadata: ProjectMetadata = {
      id: projectId,
      name: name || this.getDefaultProjectName(),
      createdAt: now,
      updatedAt: now,
    };

    const projects = this.list();
    projects.push(metadata);

    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
    this.save(projectId, data);
    return projectId;
  }

  // Update project metadata (name, updatedAt)
  // Throws if project not found or on storage error
  updateMetadata(
    projectId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
  ): void {
    const projects = this.list();
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

  // Delete project (metadata and document; referenced assets are kept)
  // Throws on storage error
  delete(projectId: string): void {
    const projects = this.list();
    const filtered = projects.filter((p) => p.id !== projectId);

    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(filtered));
    localStorage.removeItem(getProjectKey(projectId));

    // If deleting last project, clear that too
    if (this.getLastProjectId() === projectId) {
      localStorage.removeItem(LAST_PROJECT_ID_KEY);
    }
  }

  // Get default project name with sequential numbering
  private getDefaultProjectName(): string {
    const untitledCount = this.list().filter((p) =>
      p.name.match(/^Untitled( \d+)?$/),
    ).length;

    return untitledCount === 0 ? "Untitled" : `Untitled ${untitledCount + 1}`;
  }

  // === document data — localStorage "toy-midi-project-<id>" ===

  // Load project document, migrated to the current schema (pure - no Zustand)
  // Throws if not found or on parse error - caller should handle
  load(projectId: string): SavedProject {
    const json = localStorage.getItem(getProjectKey(projectId));
    if (!json) {
      throw new Error(`Project ${projectId} not found in storage`);
    }
    return migrateSavedProject(JSON.parse(json) as AnySavedProject);
  }

  // Save project document (pure - no Zustand); also bumps updatedAt + lastProjectId
  // Throws on error - caller should handle with toast
  save(projectId: string, data: SavedProject): void {
    localStorage.setItem(getProjectKey(projectId), JSON.stringify(data));
    this.updateMetadata(projectId, { updatedAt: Date.now() });
    this.setLastProjectId(projectId);
  }

  // === session pointer — localStorage "toy-midi-last-project-id" ===

  getLastProjectId(): string | null {
    return localStorage.getItem(LAST_PROJECT_ID_KEY);
  }

  setLastProjectId(projectId: string): void {
    localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
  }

  // === binary assets — IndexedDB "toy-midi" / "assets" ===

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

// === private helpers ===

// Generate unique project ID
function generateProjectId(): string {
  // Use crypto.randomUUID() if available, otherwise fallback to timestamp + random
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `project-${crypto.randomUUID()}`;
  }
  return `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get storage key for a specific project
function getProjectKey(projectId: string): string {
  return `toy-midi-project-${projectId}`;
}

// Generate a simple hash key from file name + size + last modified
function generateAssetKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

// === e2e-only ===

// for testing migration
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
