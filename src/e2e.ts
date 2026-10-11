import { projectStorage } from "./lib/editor-project-storage";
import {
  legacyProjectStorage,
  seedProjectLegacyV2,
  seedProjectLegacyV1,
  seedLegacyLayoutV1Project,
} from "./lib/project-storage";

const utils = {
  legacyProjectStorage,
  seedProjectLegacyV2,
  seedProjectLegacyV1,
  seedLegacyLayoutV1Project,
  projectStorage,
};

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
