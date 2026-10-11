import {
  legacyProjectStorage,
  seedLegacyProjectV2,
  seedLegacyProjectV1,
  seedLegacyLayoutV1Project,
} from "./lib/legacy-project-storage";
import { projectStorage } from "./lib/project-storage";

const utils = {
  legacyProjectStorage,
  seedLegacyProjectV2,
  seedLegacyProjectV1,
  seedLegacyLayoutV1Project,
  projectStorage,
};

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
