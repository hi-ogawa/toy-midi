import {
  legacyProjectStorage,
  seedProjectLegacyV2,
} from "./lib/project-storage";

const utils = { legacyProjectStorage, seedProjectLegacyV2 };

window.__e2e = utils;

declare global {
  interface Window {
    __e2e: typeof utils;
  }
}
