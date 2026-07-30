// Persistence facade for all project storage.
//
// Assets are keyed by source file (name + size + lastModified), so the same
// file imported into multiple projects shares one asset; delete() does NOT
// remove assets referenced by the deleted project (no garbage collection).

import { z } from "zod";
import { IdbStore } from "./idb";
import {
  type AnySavedProject,
  createDefaultSavedProject,
  migrateSavedProject,
  type SavedProject,
  type SavedProjectV1,
} from "./project-store";

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

// Storage layout v2. The ":v2" on the list key marks the storage LAYOUT
// generation (how keys are arranged), never the doc schema — SavedProject
// carries its own version and migrates lazily at read time.
//
// Migration tier rule: compatible doc-schema changes ride the lazy
// value-versioned migration (migrateSavedProject on load, persisted by the
// next save); breaking or lossy changes get promoted to a layout bump — new
// list-key version, copy-then-commit-then-delete, like migrateLayoutV1 below.
// If you'd want a backup, it's a layout bump.
//
// Concurrency: accepted-risk, single-writer-ish. Every op read-modify-writes
// its own entry against a fresh list read, never a cached snapshot, so two
// editors on different projects can't lose each other's entries; structural
// ops (create/delete) racing another tab's autosave are out of scope.
const PROJECT_LIST_KEY = "toy-midi:project-list:v2";
// project document, one localStorage entry per project (internally versioned)
const PROJECT_KEY_PREFIX = "toy-midi:project:";

// Based on https://github.com/hi-ogawa/demucs-onnx/blob/main/packages/app/src/lib/preferences.ts.
const PREFERENCES_KEY = "toy-midi:preferences";
const preferencesSchema = z.object({
  defaultMidiProgram: z.number().int().min(0).max(127),
});
type Preferences = z.infer<typeof preferencesSchema>;
const DEFAULT_PREFERENCES: Preferences = {
  defaultMidiProgram: 0,
};

// Layout v1 keys, read only by the one-time migration below.
const LEGACY_LIST_KEY = "toy-midi-project-list";
const LEGACY_LAST_ID_KEY = "toy-midi-last-project-id";
const LEGACY_PROJECT_KEY_PREFIX = "toy-midi-project-";

// Single JSON: the metadata list (cheap enumeration for the list view) plus
// the last-opened pointer.
interface ProjectList {
  projects: ProjectMetadata[];
  lastProjectId?: string;
}

class ProjectStorage {
  private readProjectList(): ProjectList {
    migrateLayoutV1();
    const json = localStorage.getItem(PROJECT_LIST_KEY);
    if (!json) {
      return { projects: [] };
    }
    return JSON.parse(json) as ProjectList;
  }

  private writeProjectList(projectList: ProjectList): void {
    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projectList));
  }

  listMetadata(): ProjectMetadata[] {
    return this.readProjectList().projects.sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  getMetadata(projectId: string): ProjectMetadata | undefined {
    return this.listMetadata().find((p) => p.id === projectId);
  }

  createNew(): string {
    const project = {
      ...createDefaultSavedProject(),
      midiProgram: this.readPreferences().defaultMidiProgram,
    };
    return this.create(this.getDefaultProjectName(), project);
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

    const projectList = this.readProjectList();
    projectList.projects.push(metadata);
    this.writeProjectList(projectList);
    this.save(projectId, data);
    return projectId;
  }

  updateMetadata(
    projectId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
  ): void {
    const projectList = this.readProjectList();
    const index = projectList.projects.findIndex((p) => p.id === projectId);
    if (index === -1) {
      throw new Error(`Project ${projectId} not found`);
    }

    projectList.projects[index] = {
      ...projectList.projects[index],
      ...updates,
    };
    this.writeProjectList(projectList);
  }

  delete(projectId: string): void {
    const projectList = this.readProjectList();
    projectList.projects = projectList.projects.filter(
      (p) => p.id !== projectId,
    );
    if (projectList.lastProjectId === projectId) {
      projectList.lastProjectId = undefined;
    }
    this.writeProjectList(projectList);
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

  getLastProjectId(): string | undefined {
    return this.readProjectList().lastProjectId;
  }

  setLastProjectId(projectId: string): void {
    const projectList = this.readProjectList();
    projectList.lastProjectId = projectId;
    this.writeProjectList(projectList);
  }

  readPreferences(): Preferences {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      return preferencesSchema.parse({ ...DEFAULT_PREFERENCES, ...stored });
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  writePreferences(preferences: Preferences): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be disabled or unavailable without preventing editing.
    }
  }

  updatePreferences(updates: Partial<Preferences>): void {
    this.writePreferences({ ...this.readPreferences(), ...updates });
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

  async loadAsset(key: string): Promise<StoredAsset | undefined> {
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
// into the list, and only then delete the v1 keys. The list write is the
// commit point: a crash before it leaves v1 intact and the migration simply
// re-runs on the next load. Assets (IndexedDB) are unaffected.
let checkedLayout = false;
function migrateLayoutV1(): void {
  if (checkedLayout) {
    return;
  }
  checkedLayout = true;
  if (localStorage.getItem(PROJECT_LIST_KEY) !== null) {
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
    ? legacyLastId
    : undefined;

  const projectList: ProjectList = { projects, lastProjectId };
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projectList));

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
