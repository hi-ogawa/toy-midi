import { flushAutoSave } from "./lib/project-session";
import { projectStorage, seedProjectV1 } from "./lib/project-storage";
import { useProjectStore } from "./stores/project-store";

declare global {
  interface Window {
    __e2e: {
      useProjectStore: typeof useProjectStore;
      projectStorage: typeof projectStorage;
      seedProjectV1: typeof seedProjectV1;
      flushAutoSave: typeof flushAutoSave;
    };
  }
}

window.__e2e = {
  useProjectStore,
  projectStorage,
  seedProjectV1,
  flushAutoSave,
};
