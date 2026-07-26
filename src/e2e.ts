import { flushAutoSave } from "./lib/project-session";
import {
  projectStorage,
  seedLayoutV1Project,
  seedProjectV1,
} from "./lib/project-storage";
import { useProjectStore } from "./lib/project-store";

const utils = {
  useProjectStore,
  projectStorage,
  seedProjectV1,
  seedLayoutV1Project,
  flushAutoSave,
};

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
