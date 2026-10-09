import { connectAgentBridge } from "@hiogawa/agent-bridge/client";
import { useEffect } from "react";
import { createAgentTools } from "../../lib/agent-tools";
import type { RecorderRuntime } from "../../lib/recorder/runtime";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Connects the open project's agent tools to the local agent bridge when the
 * page URL has `?agent-bridge` or `?agent-bridge=<port>`.
 */
export function useAgentBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    if (!params.has("agent-bridge")) {
      return;
    }
    const port = params.get("agent-bridge") || DEFAULT_BRIDGE_PORT;
    return connectAgentBridge({
      bridgeUrl: `http://localhost:${port}`,
      tools: createAgentTools(runtime),
    });
  }, [runtime]);
}
