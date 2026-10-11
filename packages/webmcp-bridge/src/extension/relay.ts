/// <reference types="chrome" />

// Runs in the extension's isolated world next to the content script, which
// cannot reach the extension's APIs from the page's world, and forwards its
// connection status to the background worker.

import type { StatusMessage } from "./shared.ts";

function main() {
  window.addEventListener("message", (event: MessageEvent<StatusMessage>) => {
    if (
      event.source === window &&
      event.data?.type === "webmcp-bridge:status"
    ) {
      void chrome.runtime.sendMessage(event.data);
    }
  });
}

main();
