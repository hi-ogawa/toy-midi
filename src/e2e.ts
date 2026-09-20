import { IdbStore } from "./lib/idb";
import {
  createDefaultSavedProject,
  type SavedProject,
} from "./lib/project-store";

function seedLegacyProject({
  name,
  project = createDefaultSavedProject(),
}: {
  name: string;
  project?: SavedProject;
}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const key = "toy-midi:project-list:v2";
  const list = JSON.parse(localStorage.getItem(key) ?? '{"projects":[]}');
  list.projects.push({ id, name, createdAt: now, updatedAt: now });
  localStorage.setItem(key, JSON.stringify(list));
  localStorage.setItem(`toy-midi:project:${id}`, JSON.stringify(project));
  return id;
}

async function seedProjectLegacyV2({
  name,
  project,
  audioData,
}: {
  name: string;
  project: SavedProject;
  audioData: Record<string, Uint8Array<ArrayBuffer>>;
}) {
  const assets = new IdbStore<{ key: string; blob: Blob }>({
    dbName: "toy-midi",
    storeName: "assets",
    version: 1,
    keyPath: "key",
  });
  const audioTracks: SavedProject["audioTracks"] = [];
  for (const track of project.audioTracks) {
    const data = audioData[track.id];
    if (!data) {
      throw new Error(`Missing seed audio for track "${track.id}"`);
    }
    const assetKey = crypto.randomUUID();
    await assets.put({
      key: assetKey,
      blob: new File([data], track.fileName, { type: "audio/wav" }),
    });
    audioTracks.push({ ...track, assetKey });
  }
  seedLegacyProject({ name, project: { ...project, audioTracks } });
}

const utils = { seedLegacyProject, seedProjectLegacyV2 };
window.__e2e = utils;
declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
