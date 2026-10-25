import { createSharedProject, type SharedProject } from "./project-share";
import type { EditorRuntime } from "./runtime";

/**
 * Helpers in scope as `utils` in `toy_midi_eval`, for work beside the open
 * project rather than on it.
 */
export interface AgentUtils {
  /**
   * The open project in the format of share links and project files, which
   * leaves out audio tracks.
   */
  getSharedProject(): SharedProject;
}

export function createAgentUtils(runtime: EditorRuntime): AgentUtils {
  return {
    getSharedProject: () => createSharedProject(runtime.serializeProject()),
  };
}
