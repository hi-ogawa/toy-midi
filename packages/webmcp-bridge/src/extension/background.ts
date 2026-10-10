/// <reference types="chrome" />

// The sites the user has granted host access to are the sites the content
// script runs on, and within them, only the tabs the user opts in are exposed
// to the bridge. Clicking the extension's button allows the current site and
// opts its tab in, or opts an allowed site's tab in or out.

import { EXPOSE_EVENT } from "./shared.ts";

const CONTENT_SCRIPT_ID = "content";

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
  chrome.tabs.onRemoved.addListener((tabId) =>
    chrome.storage.session.remove(tabKey(tabId)),
  );

  // For E2E, which cannot click the extension's button.
  Object.assign(globalThis, { __e2e: { toggleTab } });
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
  await chrome.action.setBadgeText({ tabId, text: origin ? "ON" : "" });
}

function tabKey(tabId: number) {
  return `tab:${tabId}`;
}

async function dispatchExpose(tabId: number, exposed: boolean) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (type: string, detail: boolean) => {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    },
    args: [EXPOSE_EVENT, exposed],
  });
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
  ]);
}

main();
