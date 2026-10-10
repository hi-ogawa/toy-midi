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
    const origin = await getExposedOrigin(tabId);
    if (!origin) {
      return;
    }
    if (!tab.url || new URL(tab.url).origin !== origin) {
      await setExposedOrigin(tabId, undefined);
      return;
    }
    await setExposedOrigin(tabId, origin);
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
    __e2e: { toggleTab, setBridgePort, getBadgeText },
  });
}

async function toggleTab(tabId: number, origin: string) {
  const exposed = !(await getExposedOrigin(tabId));
  await setExposedOrigin(tabId, exposed ? origin : undefined);
  // A site allowed by this click has no content script in the tab yet, so
  // reload it, and `onUpdated` exposes it.
  if (!(await isContentScriptRegistered(origin))) {
    await syncContentScript();
    await chrome.tabs.reload(tabId);
    return;
  }
  await dispatchExpose(tabId, exposed);
}

async function getExposedOrigin(tabId: number) {
  const key = tabKey(tabId);
  const items = await chrome.storage.session.get(key);
  return items[key] as string | undefined;
}

async function setExposedOrigin(tabId: number, origin: string | undefined) {
  await (origin
    ? chrome.storage.session.set({ [tabKey(tabId)]: origin })
    : chrome.storage.session.remove(tabKey(tabId)));
  await showBadge(tabId, origin ? connectingBadge() : offBadge());
}

async function showStatus(tabId: number, status: BridgeStatus) {
  const origin = await getExposedOrigin(tabId);
  // A status that arrives after the tab is turned off is stale.
  if (!origin) {
    return;
  }
  switch (status) {
    case "connecting": {
      await showBadge(tabId, connectingBadge());
      break;
    }
    case "connected": {
      await showBadge(tabId, {
        text: "ON",
        color: "#16a34a",
        title: "Connected to the bridge",
      });
      break;
    }
    case "closed": {
      await showBadge(tabId, {
        text: "!",
        color: "#dc2626",
        title: `The bridge refused this site. Allow it with webmcp-bridge allow ${origin}`,
      });
      break;
    }
  }
}

function connectingBadge(): Badge {
  return {
    text: "…",
    color: "#d97706",
    title: "Connecting to the bridge. Is webmcp-bridge serve running?",
  };
}

function offBadge(): Badge {
  return {
    text: "",
    color: "#000000",
    title: chrome.runtime.getManifest().action!.default_title!,
  };
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

async function dispatchExpose(tabId: number, exposed: boolean) {
  const bridgeUrl = `http://localhost:${await getBridgePort()}`;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (type: string, detail?: string) => {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    },
    args: exposed ? [EXPOSE_EVENT, bridgeUrl] : [EXPOSE_EVENT],
  });
}

async function getBridgePort() {
  const items = await chrome.storage.local.get(BRIDGE_PORT_KEY);
  return (items[BRIDGE_PORT_KEY] as number | undefined) ?? DEFAULT_BRIDGE_PORT;
}

async function setBridgePort(port: number) {
  await chrome.storage.local.set({ [BRIDGE_PORT_KEY]: port });
}

async function isContentScriptRegistered(origin: string) {
  const [script] = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID],
  });
  return script?.matches?.includes(`${origin}/*`) ?? false;
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
