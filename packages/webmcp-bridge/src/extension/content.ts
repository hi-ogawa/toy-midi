// The extension's content script. It runs in the page's main world before the
// page's own scripts on the sites the user allows, and installs the WebMCP
// polyfill where the browser has no `document.modelContext`. It answers the
// bridge's requests that the relay script passes in while the tab is exposed.

import { createRequestHandler } from "../client.ts";
import { createModelContextPolyfill } from "../model-context-polyfill.ts";
import type { PageMessage } from "./shared.ts";

function main() {
  const modelContext = (document.modelContext ??= createModelContextPolyfill());
  const handleRequest = createRequestHandler(modelContext);

  window.addEventListener(
    "message",
    async (event: MessageEvent<PageMessage>) => {
      if (
        event.source === window &&
        event.data?.type === "webmcp-bridge:request"
      ) {
        window.postMessage(
          {
            type: "webmcp-bridge:result",
            data: await handleRequest(event.data.data),
          } satisfies PageMessage,
          window.location.origin,
        );
      }
    },
  );
}

main();
