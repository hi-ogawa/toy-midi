import {
  projectStorage,
  seedProjectLegacyV2,
} from "./lib/legacy-project-storage";

const utils = { projectStorage, seedProjectLegacyV2 };

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
