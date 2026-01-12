// Project management for multiple project support

import type { SavedProject } from "../stores/project-store";

const PROJECT_LIST_KEY = "toy-midi-project-list";
const LAST_PROJECT_ID_KEY = "toy-midi-last-project-id";
const OLD_STORAGE_KEY = "toy-midi-project";

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

// Generate unique project ID
export function generateProjectId(): string {
  // Use crypto.randomUUID() if available, otherwise fallback to timestamp + random
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `project-${crypto.randomUUID()}`;
  }
  return `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get storage key for a specific project
export function getProjectKey(projectId: string): string {
  return `toy-midi-project-${projectId}`;
}

// List all projects
export function listProjects(): ProjectMetadata[] {
  const json = localStorage.getItem(PROJECT_LIST_KEY);
  if (!json) return [];
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
export function getDefaultProjectName(): string {
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
  setLastProjectId(projectId);
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

// Check if any projects exist
export function hasProjects(): boolean {
  return listProjects().length > 0;
}

// Migrate from old single-project storage to new multi-project storage
export function migrateFromSingleProject(): boolean {
  // Check if migration is needed
  if (!localStorage.getItem(OLD_STORAGE_KEY)) {
    return false; // Nothing to migrate
  }

  if (localStorage.getItem(PROJECT_LIST_KEY)) {
    return false; // Already migrated
  }

  // Create new project entry
  const projectId = generateProjectId();
  const now = Date.now();

  // Copy old project data to new key
  const oldProject = localStorage.getItem(OLD_STORAGE_KEY);
  if (oldProject) {
    localStorage.setItem(getProjectKey(projectId), oldProject);
  }

  // Create project list with single entry
  const projectList: ProjectMetadata[] = [
    {
      id: projectId,
      name: "Untitled",
      createdAt: now,
      updatedAt: now,
    },
  ];
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projectList));
  setLastProjectId(projectId);

  // Clean up old key
  localStorage.removeItem(OLD_STORAGE_KEY);

  console.log("Migrated single project to multi-project storage");
  return true;
}

// === Project Data Operations ===

// Check if any projects exist (for startup screen)
export function hasSavedProject(): boolean {
  if (localStorage.getItem(OLD_STORAGE_KEY) !== null) {
    return true;
  }
  return getLastProjectId() !== null;
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
export function loadProjectData(projectId: string): SavedProject {
  const storageKey = getProjectKey(projectId);
  const json = localStorage.getItem(storageKey);
  if (!json) {
    throw new Error(`Project ${projectId} not found in storage`);
  }
  return JSON.parse(json) as SavedProject;
}
