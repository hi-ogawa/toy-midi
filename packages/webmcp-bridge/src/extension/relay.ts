/// <reference types="chrome" />

// Runs in the extension's isolated world next to the content script, which
// cannot reach the extension's APIs from the page's world. While the tab is
// exposed, it holds a port to the offscreen document, which keeps the
// connection to the bridge, and passes requests and results between the port
// and the page. The port closes with the page, which ends the connection.

import type { ExposeMessage, PageMessage, ResumeMessage } from "./shared.ts";

function main() {
  let port: chrome.runtime.Port | undefined;

  function expose(bridgeUrl: string | undefined) {
    port?.disconnect();
    port = undefined;
    if (bridgeUrl) {
      // The port's name tells the offscreen document where to connect.
      port = chrome.runtime.connect({ name: bridgeUrl });
      port.onMessage.addListener((request: string) =>
        window.postMessage(
          {
            type: "webmcp-bridge:request",
            data: request,
          } satisfies PageMessage,
          window.location.origin,
        ),
      );
    }
  }

  window.addEventListener("message", (event: MessageEvent<PageMessage>) => {
    if (
      event.source === window &&
      event.data?.type === "webmcp-bridge:result"
    ) {
      port?.postMessage(event.data.data);
    }
  });
  chrome.runtime.onMessage.addListener((message: ExposeMessage) => {
    if (message.type === "webmcp-bridge:expose") {
      expose(message.bridgeUrl);
    }
  });
  void chrome.runtime
    .sendMessage({ type: "webmcp-bridge:resume" } satisfies ResumeMessage)
    .then(expose);
}

main();
