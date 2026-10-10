import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Config {
  origins?: string[];
}

export function getConfigPath() {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "webmcp-bridge", "config.json");
}

export function readConfigOrigins() {
  return readConfig().origins ?? [];
}

export function addConfigOrigin(origin: string) {
  const config = readConfig();
  if (config.origins?.includes(origin)) {
    return;
  }
  config.origins = [...(config.origins ?? []), origin];
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), "utf8")) as Config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
