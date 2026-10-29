/// <reference types="chrome" />

// The extension's offscreen document. It holds one connection to the bridge
// for each exposed tab, as the bridge's origin check sees the extension rather
// than each site, and the background worker can be suspended while a
// connection stays open.

import { connectBridge } from "../client.ts";
import type { StatusMessage } from "./shared.ts";

function main() {
  chrome.runtime.onConnect.addListener((port) => {
    const tabId = port.sender!.tab!.id!;
    const connection = connectBridge({
      bridgeUrl: port.name,
      pageUrl: port.sender!.url!,
      onRequest: (request) => port.postMessage(request),
      onStatus: (status) =>
        void chrome.runtime.sendMessage({
          type: "webmcp-bridge:status",
          tabId,
          status,
        } satisfies StatusMessage),
    });
    port.onMessage.addListener((result: string) =>
      connection.postResult(result),
    );
    port.onDisconnect.addListener(connection.close);
  });
}

main();
