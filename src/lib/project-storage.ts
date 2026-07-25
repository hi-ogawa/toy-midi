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

// Storage layout v2. The ":v2" on the index key marks the storage LAYOUT
// generation (how keys are arranged), never the doc schema — SavedProject
// carries its own version and migrates lazily at read time.
//
// Migration tier rule: compatible doc-schema changes ride the lazy
// value-versioned migration (migrateSavedProject on load, persisted by the
// next save); breaking or lossy changes get promoted to a layout bump — new
// index version, copy-then-commit-then-delete, like migrateLayoutV1 below.
// If you'd want a backup, it's a layout bump.
//
// Concurrency: accepted-risk, single-writer-ish. Every op read-modify-writes
// its own entry against a fresh index read, never a cached snapshot, so two
// editors on different projects can't lose each other's entries; structural
// ops (create/delete) racing another tab's autosave are out of scope.
const INDEX_KEY = "toy-midi:project-list:v2";
// project document, one localStorage entry per project (internally versioned)
const PROJECT_KEY_PREFIX = "toy-midi:project:";

// Layout v1 keys, read only by the one-time migration below.
const LEGACY_LIST_KEY = "toy-midi-project-list";
const LEGACY_LAST_ID_KEY = "toy-midi-last-project-id";
const LEGACY_PROJECT_KEY_PREFIX = "toy-midi-project-";

// Single JSON: the metadata list (cheap enumeration for the list view) plus
// the last-opened pointer.
interface ProjectIndex {
  projects: ProjectMetadata[];
  lastProjectId: string | null;
}

class ProjectStorage {
  private readIndex(): ProjectIndex {
    migrateLayoutV1();
    const json = localStorage.getItem(INDEX_KEY);
    if (!json) {
      return { projects: [], lastProjectId: null };
    }
    return JSON.parse(json) as ProjectIndex;
  }

  private writeIndex(index: ProjectIndex): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  listMetadata(): ProjectMetadata[] {
    return this.readIndex().projects.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const projectId = crypto.randomUUID();
    const now = Date.now();
    const metadata: ProjectMetadata = {
      id: projectId,
      name,
      createdAt: now,
      updatedAt: now,
    };

    const index = this.readIndex();
    index.projects.push(metadata);
    this.writeIndex(index);
    this.save(projectId, data);
    return projectId;
  }

  updateMetadata(
    projectId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
  ): void {
    const index = this.readIndex();
    const at = index.projects.findIndex((p) => p.id === projectId);
    if (at === -1) {
      throw new Error(`Project ${projectId} not found`);
    }

    index.projects[at] = {
      ...index.projects[at],
      ...updates,
    };
    this.writeIndex(index);
  }

  delete(projectId: string): void {
    const index = this.readIndex();
    index.projects = index.projects.filter((p) => p.id !== projectId);
    if (index.lastProjectId === projectId) {
      index.lastProjectId = null;
    }
    this.writeIndex(index);
    localStorage.removeItem(getProjectKey(projectId));
  }

  private getDefaultProjectName(): string {
    const untitledCount = this.listMetadata().filter((p) =>
      p.name.match(/^Untitled( \d+)?$/),
    ).length;

    return untitledCount === 0 ? "Untitled" : `Untitled ${untitledCount + 1}`;
  }

  load(projectId: string): SavedProject {
    migrateLayoutV1();
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
    return this.readIndex().lastProjectId;
  }

  setLastProjectId(projectId: string): void {
    const index = this.readIndex();
    index.lastProjectId = projectId;
    this.writeIndex(index);
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

function getProjectKey(projectId: string): string {
  return `${PROJECT_KEY_PREFIX}${projectId}`;
}

function generateAssetKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

// One-time layout v1 → v2 migration: strip the legacy "project-" id prefix
// (which doubled into "toy-midi-project-project-<uuid>" doc keys), copy docs
// to v2 keys as raw strings (no schema touch), fold the last-project pointer
// into the index, and only then delete the v1 keys. The index write is the
// commit point: a crash before it leaves v1 intact and the migration simply
// re-runs on the next load. Assets (IndexedDB) are unaffected.
let checkedLayout = false;
function migrateLayoutV1(): void {
  if (checkedLayout) {
    return;
  }
  checkedLayout = true;
  if (localStorage.getItem(INDEX_KEY) !== null) {
    return;
  }
  const legacyJson = localStorage.getItem(LEGACY_LIST_KEY);
  if (!legacyJson) {
    return; // fresh install
  }

  const legacyList = JSON.parse(legacyJson) as ProjectMetadata[];
  const projects: ProjectMetadata[] = [];
  const copiedLegacyKeys: string[] = [];
  for (const entry of legacyList) {
    const doc = localStorage.getItem(LEGACY_PROJECT_KEY_PREFIX + entry.id);
    if (doc === null) {
      continue; // entry without a doc: drop it
    }
    const bareId = entry.id.replace(/^project-/, "");
    localStorage.setItem(getProjectKey(bareId), doc);
    copiedLegacyKeys.push(LEGACY_PROJECT_KEY_PREFIX + entry.id);
    projects.push({ ...entry, id: bareId });
  }
  const legacyLastId = localStorage
    .getItem(LEGACY_LAST_ID_KEY)
    ?.replace(/^project-/, "");
  const lastProjectId = projects.some((p) => p.id === legacyLastId)
    ? (legacyLastId ?? null)
    : null;

  const index: ProjectIndex = { projects, lastProjectId };
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));

  localStorage.removeItem(LEGACY_LIST_KEY);
  localStorage.removeItem(LEGACY_LAST_ID_KEY);
  for (const key of copiedLegacyKeys) {
    localStorage.removeItem(key);
  }
}

// e2e-only: seed an old-schema project to test doc migration on load
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

// e2e-only: seed a layout-v1 project (prefixed id, separate list/pointer
// keys) to test the layout migration above
export function seedLayoutV1Project(
  name: string,
  overrides?: Partial<SavedProject>,
): string {
  const projectId = `project-${crypto.randomUUID()}`;
  const now = Date.now();
  const list = JSON.parse(
    localStorage.getItem(LEGACY_LIST_KEY) ?? "[]",
  ) as ProjectMetadata[];
  list.push({ id: projectId, name, createdAt: now, updatedAt: now });
  localStorage.setItem(LEGACY_LIST_KEY, JSON.stringify(list));
  localStorage.setItem(
    LEGACY_PROJECT_KEY_PREFIX + projectId,
    JSON.stringify({ ...createDefaultSavedProject(), ...overrides }),
  );
  localStorage.setItem(LEGACY_LAST_ID_KEY, projectId);
  return projectId;
}
