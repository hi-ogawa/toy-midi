import { useEffect, useEffectEvent } from "react";
import { connectAgentBridge } from "../../lib/agent-bridge";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import type { UseRecorderProjectResult } from "./use-recorder-project";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Connects the open project to the local agent bridge when the page URL has
 * `?agent-bridge` or `?agent-bridge=<port>`, so an agent can run code against
 * `app.runtime` and `app.project()`.
 */
export function useRecorderAgentBridge({
  runtime,
  project,
}: {
  runtime: RecorderRuntime;
  project: UseRecorderProjectResult;
}) {
  const getProject = useEffectEvent(() => project);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    if (!params.has("agent-bridge")) {
      return;
    }
    const port = params.get("agent-bridge") || DEFAULT_BRIDGE_PORT;
    return connectAgentBridge({
      bridgeUrl: `http://localhost:${port}`,
      app: { runtime, project: getProject },
    });
  }, [runtime]);
}
