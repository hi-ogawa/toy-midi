// The extension's content script. It runs in the page's main world before the
// page's own scripts on the sites the user allows, and installs the WebMCP
// polyfill where the browser has no `document.modelContext`. It exposes the
// page's tools to the local bridge only while the user has opted the tab in.

import { exposeModelContext } from "../client.ts";
import { createModelContextPolyfill } from "../model-context-polyfill.ts";
import { EXPOSE_EVENT, type StatusMessage } from "./shared.ts";

function main() {
  const modelContext = (document.modelContext ??= createModelContextPolyfill());
  let dispose: (() => void) | undefined;

  window.addEventListener(EXPOSE_EVENT, (event) => {
    // Cancelling tells the background worker that this tab has the script.
    event.preventDefault();
    dispose?.();
    dispose = undefined;
    const bridgeUrl = (event as CustomEvent<string | undefined>).detail;
    if (bridgeUrl) {
      dispose = exposeModelContext({
        bridgeUrl,
        modelContext,
        onStatus: (status) =>
          window.postMessage(
            { type: "webmcp-bridge:status", status } satisfies StatusMessage,
            window.location.origin,
          ),
      });
    }
  });
}

main();
