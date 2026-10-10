/// <reference types="chrome" />

// The sites the user has granted host access to are the sites the content
// script runs on, and within them, only the tabs the user opts in are exposed
// to the bridge. Clicking the extension's button allows the current site and
// opts its tab in, or opts an allowed site's tab in or out.

import type { BridgeStatus } from "../client.ts";
import { DEFAULT_BRIDGE_PORT } from "../protocol.ts";
import { EXPOSE_EVENT, type StatusMessage } from "./shared.ts";

const CONTENT_SCRIPT_ID = "content";
const RELAY_SCRIPT_ID = "relay";
// Set only by E2E for now, as an options page would.
const BRIDGE_PORT_KEY = "bridgePort";

function main() {
  chrome.action.onClicked.addListener(async (tab) => {
    // `activeTab` makes the URL readable for this click.
    const origin = new URL(tab.url!).origin;
    // Requested before any other await, while the click still counts as a user
    // gesture. It resolves right away for a site already allowed.
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    });
    if (granted) {
      await toggleTab(tab.id!, origin);
    }
  });
  chrome.runtime.onInstalled.addListener(syncContentScript);
  chrome.permissions.onAdded.addListener(syncContentScript);
  chrome.permissions.onRemoved.addListener(syncContentScript);

  // An opted-in tab stays exposed across reloads, until it leaves the site.
  chrome.tabs.onUpdated.addListener(async (tabId, { status }, tab) => {
    if (status !== "loading") {
      return;
    }
    const state = await getTabState(tabId);
    if (!state) {
      return;
    }
    if (!tab.url || new URL(tab.url).origin !== state.origin) {
      await setTabState(tabId, undefined);
      return;
    }
    await setTabState(tabId, { origin: state.origin, status: "connecting" });
    await dispatchExpose(tabId, true);
  });
  chrome.runtime.onMessage.addListener((message: StatusMessage, sender) => {
    if (message.type === "webmcp-bridge:status" && sender.tab?.id) {
      void showStatus(sender.tab.id, message.status);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) =>
    chrome.storage.session.remove(tabKey(tabId)),
  );

  // For E2E, which cannot click the extension's button.
  Object.assign(globalThis, {
    __e2e: { toggleTab, setBridgePort, getBadgeText, syncContentScript },
  });
}

async function toggleTab(tabId: number, origin: string) {
  const state = await getTabState(tabId);
  // The bridge does not retry a refused page, so a click on a refused tab
  // connects it again, for a site allowed since.
  const exposed = !state || state.status === "closed";
  await setTabState(
    tabId,
    exposed ? { origin, status: "connecting" } : undefined,
  );
  // A tab loaded before its site was allowed has no content script, so reload
  // it once the script is registered, and `onUpdated` exposes it.
  if (!(await dispatchExpose(tabId, exposed)) && exposed) {
    await syncContentScript();
    await chrome.tabs.reload(tabId);
  }
}

interface TabState {
  origin: string;
  status: BridgeStatus;
}

async function getTabState(tabId: number) {
  const key = tabKey(tabId);
  const items = await chrome.storage.session.get(key);
  return items[key] as TabState | undefined;
}

async function setTabState(tabId: number, state: TabState | undefined) {
  await (state
    ? chrome.storage.session.set({ [tabKey(tabId)]: state })
    : chrome.storage.session.remove(tabKey(tabId)));
  await showBadge(tabId, getBadge(state));
}

async function showStatus(tabId: number, status: BridgeStatus) {
  const state = await getTabState(tabId);
  // A status that arrives after the tab is turned off is stale.
  if (state) {
    await setTabState(tabId, { ...state, status });
  }
}

function getBadge(state: TabState | undefined): Badge {
  switch (state?.status) {
    case undefined: {
      return {
        text: "",
        color: "#000000",
        title: chrome.runtime.getManifest().action!.default_title!,
      };
    }
    case "connecting": {
      return {
        text: "…",
        color: "#d97706",
        title: "Connecting to the bridge. Is webmcp-bridge serve running?",
      };
    }
    case "connected": {
      return {
        text: "ON",
        color: "#16a34a",
        title: "Connected to the bridge",
      };
    }
    case "closed": {
      return {
        text: "!",
        color: "#dc2626",
        title: `The bridge refused this site. Allow it with webmcp-bridge allow ${state.origin}, then click to retry`,
      };
    }
  }
}

interface Badge {
  text: string;
  color: string;
  title: string;
}

async function showBadge(tabId: number, { text, color, title }: Badge) {
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setTitle({ tabId, title });
}

async function getBadgeText(tabId: number) {
  return await chrome.action.getBadgeText({ tabId });
}

function tabKey(tabId: number) {
  return `tab:${tabId}`;
}

/** Returns whether the tab's content script received the event. */
async function dispatchExpose(tabId: number, exposed: boolean) {
  const bridgeUrl = `http://localhost:${await getBridgePort()}`;
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (type: string, detail?: string) =>
      !window.dispatchEvent(
        new CustomEvent(type, { detail, cancelable: true }),
      ),
    args: exposed ? [EXPOSE_EVENT, bridgeUrl] : [EXPOSE_EVENT],
  });
  return injection?.result === true;
}

async function getBridgePort() {
  const items = await chrome.storage.local.get(BRIDGE_PORT_KEY);
  return (items[BRIDGE_PORT_KEY] as number | undefined) ?? DEFAULT_BRIDGE_PORT;
}

async function setBridgePort(port: number) {
  await chrome.storage.local.set({ [BRIDGE_PORT_KEY]: port });
}

// Calls can overlap, as a click and `onAdded` both follow one grant, so each
// waits for the previous one.
let syncing = Promise.resolve();

function syncContentScript() {
  syncing = syncing.then(registerContentScript);
  return syncing;
}

async function registerContentScript() {
  await chrome.scripting.unregisterContentScripts();
  const { origins = [] } = await chrome.permissions.getAll();
  if (origins.length === 0) {
    return;
  }
  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches: origins,
      js: ["content.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
    {
      id: RELAY_SCRIPT_ID,
      matches: origins,
      js: ["relay.js"],
      runAt: "document_start",
      persistAcrossSessions: true,
    },
  ]);
}

main();
