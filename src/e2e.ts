import {
  projectStorage,
  seedProjectLegacyV2,
  seedProjectV1,
  seedLayoutV1Project,
} from "./lib/project-storage";
import { recorderProjectStorage } from "./lib/recorder/project-storage";

const utils = {
  projectStorage,
  seedProjectLegacyV2,
  seedProjectV1,
  seedLayoutV1Project,
  recorderProjectStorage,
};

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
