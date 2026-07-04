// Project management for multiple project support

import type {
  AnySavedProject,
  SavedProject,
  SavedProjectV1,
} from "../stores/project-store";
import { saveAsset } from "./asset-store";

const PROJECT_LIST_KEY = "toy-midi-project-list";
const LAST_PROJECT_ID_KEY = "toy-midi-last-project-id";

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

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

// List all projects
export function listProjects(): ProjectMetadata[] {
  const json = localStorage.getItem(PROJECT_LIST_KEY);
  if (!json) {
    return [];
  }
  const list = JSON.parse(json) as ProjectMetadata[];
  // Sort by updatedAt descending (most recent first)
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Get metadata for a specific project
export function getProjectMetadata(projectId: string): ProjectMetadata | null {
  const projects = listProjects();
  return projects.find((p) => p.id === projectId) || null;
}

// Get default project name with sequential numbering
function getDefaultProjectName(): string {
  const projects = listProjects();
  const untitledCount = projects.filter((p) =>
    p.name.match(/^Untitled( \d+)?$/),
  ).length;

  return untitledCount === 0 ? "Untitled" : `Untitled ${untitledCount + 1}`;
}

// Create new project
export function createProject(name?: string): string {
  const projectId = generateProjectId();
  const now = Date.now();
  const metadata: ProjectMetadata = {
    id: projectId,
    name: name || getDefaultProjectName(),
    createdAt: now,
    updatedAt: now,
  };

  const projects = listProjects();
  projects.push(metadata);

  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
  return projectId;
}

// Update project metadata (name, updatedAt)
// Throws if project not found or on storage error
export function updateProjectMetadata(
  projectId: string,
  updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
): void {
  const projects = listProjects();
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

// Delete project (both metadata and data)
// Throws on storage error
export function deleteProject(projectId: string): void {
  const projects = listProjects();
  const filtered = projects.filter((p) => p.id !== projectId);

  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(filtered));
  localStorage.removeItem(getProjectKey(projectId));

  // If deleting last project, clear that too
  if (getLastProjectId() === projectId) {
    localStorage.removeItem(LAST_PROJECT_ID_KEY);
  }
}

// Get last opened project ID
export function getLastProjectId(): string | null {
  return localStorage.getItem(LAST_PROJECT_ID_KEY);
}

// Set last opened project ID
export function setLastProjectId(projectId: string): void {
  localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
}

// Save project data to localStorage (pure - no Zustand)
// Throws on error - caller should handle with toast
export function saveProjectData(projectId: string, data: SavedProject): void {
  const storageKey = getProjectKey(projectId);
  localStorage.setItem(storageKey, JSON.stringify(data));
  updateProjectMetadata(projectId, { updatedAt: Date.now() });
  setLastProjectId(projectId);
}

// Load project data from localStorage (pure - no Zustand)
// Throws if not found or on parse error - caller should handle
export function loadProjectData(projectId: string): AnySavedProject {
  const storageKey = getProjectKey(projectId);
  const json = localStorage.getItem(storageKey);
  if (!json) {
    throw new Error(`Project ${projectId} not found in storage`);
  }
  return JSON.parse(json) as AnySavedProject;
}

// Test-only: seed a v1 project into localStorage + IndexedDB the way the *old*
// app persisted it, so migration-on-load can be exercised against a realistic
// fixture. Exposed on `window.__e2e` from the `/__e2e__/` host route (see
// main.tsx), where the app is not mounted, so this never races the running
// app's boot reads or auto-save.
//
// The v1 payload is written directly rather than through saveProjectData: the
// current app only ever persists the current version, so its writer stays
// typed for that — this simulates a version it no longer produces.
export async function seedProjectV1(
  name: string,
  project: SavedProjectV1,
  audioData: Uint8Array<ArrayBuffer>,
): Promise<{ projectId: string; assetKey: string }> {
  if (!project.audioFileName) {
    throw new Error("Cannot seed v1 project without audio file name");
  }

  const file = new File([audioData], project.audioFileName, {
    type: "audio/wav",
  });
  const assetKey = await saveAsset(file);

  const projectId = createProject(name);
  localStorage.setItem(
    getProjectKey(projectId),
    JSON.stringify({ ...project, audioAssetKey: assetKey }),
  );
  setLastProjectId(projectId);

  return { projectId, assetKey };
}
