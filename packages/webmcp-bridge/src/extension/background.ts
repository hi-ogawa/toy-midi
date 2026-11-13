/// <reference types="chrome" />

// The sites the user has granted host access to are the sites the content
// script runs on, and within them, only the tabs the user opts in are exposed
// to the bridge. Clicking the extension's button allows the current site and
// opts its tab in, or opts an allowed site's tab in or out.

import type { BridgeStatus } from "../client.ts";
import { DEFAULT_BRIDGE_PORT } from "../protocol.ts";
import type { ExposeMessage, ResumeMessage, StatusMessage } from "./shared.ts";

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
    if (state && (!tab.url || new URL(tab.url).origin !== state.origin)) {
      await setTabState(tabId, undefined);
    }
  });
  chrome.runtime.onMessage.addListener(
    (message: ResumeMessage | StatusMessage, sender, sendResponse) => {
      switch (message.type) {
        case "webmcp-bridge:resume": {
          void resumeTab(sender).then(sendResponse);
          // Keeps `sendResponse` valid until it is called.
          return true;
        }
        case "webmcp-bridge:status": {
          void showStatus(message.tabId, message.status);
          return;
        }
      }
    },
  );
  chrome.tabs.onRemoved.addListener((tabId) =>
    chrome.storage.session.remove(tabKey(tabId)),
  );

  // For E2E, which cannot click the extension's button.
  Object.assign(globalThis, {
    __e2e: { toggleTab, setBridgePort, getBadgeText },
  });
}

async function toggleTab(tabId: number, origin: string) {
  const state = await getTabState(tabId);
  // The bridge does not retry a refused page, so a click on a refused tab
  // connects it again.
  const exposed = !state || state.status === "closed";
  await setTabState(
    tabId,
    exposed ? { origin, status: "connecting" } : undefined,
  );
  // A site allowed by this click has no content script in the tab yet, so
  // reload it, and the relay script resumes it.
  if (!(await isContentScriptRegistered(origin))) {
    await syncContentScript();
    await chrome.tabs.reload(tabId);
    return;
  }
  await chrome.tabs.sendMessage(tabId, {
    type: "webmcp-bridge:expose",
    bridgeUrl: exposed ? await prepareBridgeUrl() : undefined,
  } satisfies ExposeMessage);
}

// Answers a loading page's relay script with the bridge URL when its tab is
// opted in.
async function resumeTab(sender: chrome.runtime.MessageSender) {
  const tabId = sender.tab!.id!;
  const state = await getTabState(tabId);
  if (!state || new URL(sender.url!).origin !== state.origin) {
    return undefined;
  }
  await setTabState(tabId, { origin: state.origin, status: "connecting" });
  return await prepareBridgeUrl();
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
        title:
          "The bridge refused the extension. Update webmcp-bridge, then click to retry",
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

async function prepareBridgeUrl() {
  await prepareOffscreenDocument();
  // Chrome leaves out the Origin, which the bridge requires, on requests to a
  // host the extension may access. It may access a site on localhost, but
  // never 127.0.0.1, which the manifest does not list.
  return `http://127.0.0.1:${await getBridgePort()}`;
}

// Several tabs can resume at once, and only one offscreen document may exist,
// so they share one creation.
let offscreenDocument: Promise<void> | undefined;

function prepareOffscreenDocument() {
  offscreenDocument ??= createOffscreenDocument();
  return offscreenDocument;
}

async function createOffscreenDocument() {
  // It outlives a suspended worker, which forgets that it exists.
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification:
      "Keeps the connections of the exposed tabs to the local webmcp-bridge open.",
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
