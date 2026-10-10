// The extension's content script. It runs in the page's main world before the
// page's own scripts on the sites the user allows, and installs the WebMCP
// polyfill where the browser has no `document.modelContext`. It exposes the
// page's tools to the local bridge only while the user has opted the tab in.

import { exposeModelContext } from "../client.ts";
import { createModelContextPolyfill } from "../model-context-polyfill.ts";
import { EXPOSE_EVENT } from "./shared.ts";

// Set by the build.
declare const __WEBMCP_BRIDGE_PORT__: string;

function main() {
  const modelContext = (document.modelContext ??= createModelContextPolyfill());
  let dispose: (() => void) | undefined;

  window.addEventListener(EXPOSE_EVENT, (event) => {
    dispose?.();
    dispose = undefined;
    if ((event as CustomEvent<boolean>).detail) {
      dispose = exposeModelContext({
        bridgeUrl: `http://localhost:${__WEBMCP_BRIDGE_PORT__}`,
        modelContext,
      });
    }
  });
}

main();
