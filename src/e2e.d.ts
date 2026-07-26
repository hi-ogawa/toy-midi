import type { flushAutoSave } from "./lib/project-session";
import type {
  projectStorage,
  seedLayoutV1Project,
  seedProjectV1,
} from "./lib/project-storage";
import type { useProjectStore } from "./stores/project-store";

declare global {
  interface Window {
    __e2e?: {
      useProjectStore: typeof useProjectStore;
      projectStorage: typeof projectStorage;
      seedProjectV1: typeof seedProjectV1;
      seedLayoutV1Project: typeof seedLayoutV1Project;
      flushAutoSave: typeof flushAutoSave;
    };
  }
}

export {};
