// Project management for multiple project support

import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "../stores/project-store";

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
  try {
    const json = localStorage.getItem(PROJECT_LIST_KEY);
    if (!json) return [];
    const list = JSON.parse(json) as ProjectMetadata[];
    // Sort by updatedAt descending (most recent first)
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.warn("Failed to list projects:", e);
    return [];
  }
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

  try {
    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
    setLastProjectId(projectId);
    return projectId;
  } catch (e) {
    console.warn("Failed to create project:", e);
    throw e;
  }
}

// Update project metadata (name, updatedAt)
export function updateProjectMetadata(
  projectId: string,
  updates: Partial<Pick<ProjectMetadata, "name" | "updatedAt">>,
): void {
  const projects = listProjects();
  const index = projects.findIndex((p) => p.id === projectId);
  if (index === -1) {
    console.warn(`Project ${projectId} not found`);
    return;
  }

  projects[index] = {
    ...projects[index],
    ...updates,
  };

  try {
    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn("Failed to update project metadata:", e);
  }
}

// Delete project (both metadata and data)
export function deleteProject(projectId: string): void {
  const projects = listProjects();
  const filtered = projects.filter((p) => p.id !== projectId);

  try {
    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(filtered));
    localStorage.removeItem(getProjectKey(projectId));

    // If deleting last project, clear that too
    if (getLastProjectId() === projectId) {
      localStorage.removeItem(LAST_PROJECT_ID_KEY);
    }
  } catch (e) {
    console.warn("Failed to delete project:", e);
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

  try {
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
  } catch (e) {
    console.error("Failed to migrate project:", e);
    return false;
  }
}

// === Project Data Operations ===

// Check if any projects exist (for startup screen)
export function hasSavedProject(): boolean {
  if (localStorage.getItem(OLD_STORAGE_KEY) !== null) {
    return true;
  }
  return getLastProjectId() !== null;
}

// Save current project to localStorage
export function saveProject(): void {
  const state = useProjectStore.getState();

  if (!state.currentProjectId) {
    console.warn("Cannot save project: no current project ID set.");
    return;
  }

  const saved = toSavedProject(state);
  try {
    const storageKey = getProjectKey(state.currentProjectId);
    localStorage.setItem(storageKey, JSON.stringify(saved));
    updateProjectMetadata(state.currentProjectId, { updatedAt: Date.now() });
    setLastProjectId(state.currentProjectId);
  } catch (e) {
    console.warn("Failed to save project:", e);
  }
}

// Load project from localStorage into store
export function loadProject(projectId: string): boolean {
  try {
    const storageKey = getProjectKey(projectId);
    const json = localStorage.getItem(storageKey);
    if (!json) {
      console.warn(`Project ${projectId} not found in storage`);
      return false;
    }

    const saved = JSON.parse(json);
    const projectState = fromSavedProject(saved);

    useProjectStore.setState({
      currentProjectId: projectId,
      ...projectState,
    });

    setLastProjectId(projectId);
    return true;
  } catch (e) {
    console.warn("Failed to load project:", e);
    return false;
  }
}
