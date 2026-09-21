// Read retained legacy projects and assets for manual migration.
//
// Assets are keyed by source file (name + size + lastModified), so the same
// file imported into multiple projects shares one asset; delete() does NOT
// remove assets referenced by the deleted project (no garbage collection).

import { IdbStore } from "./idb";
import {
  type AnyLegacySavedProject,
  createDefaultLegacySavedProject,
  migrateLegacySavedProject,
  type LegacySavedProject,
  type LegacySavedProjectV1,
} from "./project-store";

export interface LegacyProjectMetadata {
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
// generation (how keys are arranged), never the doc schema — LegacySavedProject
// carries its own version and migrates lazily at read time.
//
const PROJECT_LIST_KEY = "toy-midi:project-list:v2";
// project document, one localStorage entry per project (internally versioned)
const PROJECT_KEY_PREFIX = "toy-midi:project:";

// Layout v1 keys, read only by the one-time migration below.
const LEGACY_LIST_KEY = "toy-midi-project-list";
const LEGACY_LAST_ID_KEY = "toy-midi-last-project-id";
const LEGACY_PROJECT_KEY_PREFIX = "toy-midi-project-";

// Single JSON: the metadata list (cheap enumeration for the list view) plus
// the last-opened pointer.
interface ProjectList {
  projects: LegacyProjectMetadata[];
  lastProjectId?: string;
}

class LegacyProjectStorage {
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

  listMetadata(): LegacyProjectMetadata[] {
    return this.readProjectList().projects.sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  create(name: string, data: LegacySavedProject): string {
    const projectId = crypto.randomUUID();
    const now = Date.now();
    const metadata: LegacyProjectMetadata = {
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

  createNew(): string {
    return this.create(
      this.getDefaultProjectName(),
      createDefaultLegacySavedProject(),
    );
  }

  updateMetadata(
    projectId: string,
    updates: Partial<Pick<LegacyProjectMetadata, "name" | "updatedAt">>,
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

  load(projectId: string): LegacySavedProject {
    migrateLayoutV1();
    const json = localStorage.getItem(getProjectKey(projectId));
    if (!json) {
      throw new Error(`Project ${projectId} not found in storage`);
    }
    return migrateLegacySavedProject(JSON.parse(json) as AnyLegacySavedProject);
  }

  save(projectId: string, data: LegacySavedProject): void {
    localStorage.setItem(getProjectKey(projectId), JSON.stringify(data));
    this.updateMetadata(projectId, { updatedAt: Date.now() });
  }

  setLastProjectId(projectId: string): void {
    const projectList = this.readProjectList();
    projectList.lastProjectId = projectId;
    this.writeProjectList(projectList);
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
}

export const legacyProjectStorage = new LegacyProjectStorage();

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

  const legacyList = JSON.parse(legacyJson) as LegacyProjectMetadata[];
  const projects: LegacyProjectMetadata[] = [];
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
export async function seedProjectLegacyV1(
  name: string,
  project: LegacySavedProjectV1,
  audioData: Uint8Array<ArrayBuffer>,
): Promise<void> {
  if (!project.audioFileName) {
    throw new Error("Cannot seed v1 project without audio file name");
  }

  const file = new File([audioData], project.audioFileName, {
    type: "audio/wav",
  });
  const assetKey = await legacyProjectStorage.saveAsset(file);

  project = { ...project, audioAssetKey: assetKey };
  const projectId = legacyProjectStorage.create(name, project as any);
  legacyProjectStorage.setLastProjectId(projectId);
}

// e2e-only: seed a legacy v2 project and its referenced audio assets.
export async function seedProjectLegacyV2({
  name,
  project,
  audioData,
}: {
  name: string;
  project: LegacySavedProject;
  audioData: Record<string, Uint8Array<ArrayBuffer>>;
}): Promise<void> {
  const audioTracks: LegacySavedProject["audioTracks"] = [];
  for (const track of project.audioTracks) {
    const data = audioData[track.id];
    if (!data) {
      throw new Error(`Missing seed audio for track "${track.id}"`);
    }
    const assetKey = await legacyProjectStorage.saveAsset(
      new File([data], track.fileName, { type: "audio/wav" }),
    );
    audioTracks.push({ ...track, assetKey });
  }
  const projectId = legacyProjectStorage.create(name, {
    ...project,
    audioTracks,
  });
  legacyProjectStorage.setLastProjectId(projectId);
}

// e2e-only: seed a layout-v1 project (prefixed id, separate list/pointer
// keys) to test the layout migration above
export function seedLegacyLayoutV1Project(
  name: string,
  overrides?: Partial<LegacySavedProject>,
): string {
  const projectId = `project-${crypto.randomUUID()}`;
  const now = Date.now();
  const list = JSON.parse(
    localStorage.getItem(LEGACY_LIST_KEY) ?? "[]",
  ) as LegacyProjectMetadata[];
  list.push({ id: projectId, name, createdAt: now, updatedAt: now });
  localStorage.setItem(LEGACY_LIST_KEY, JSON.stringify(list));
  localStorage.setItem(
    LEGACY_PROJECT_KEY_PREFIX + projectId,
    JSON.stringify({ ...createDefaultLegacySavedProject(), ...overrides }),
  );
  localStorage.setItem(LEGACY_LAST_ID_KEY, projectId);
  return projectId;
}
