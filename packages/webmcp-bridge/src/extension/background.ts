/// <reference types="chrome" />

// The sites the user has granted host access to are the sites the content
// script runs on. Clicking the extension's button asks for the current site,
// and removing a site in Chrome's site access settings takes it away.

const CONTENT_SCRIPT_ID = "content";

chrome.action.onClicked.addListener(async (tab) => {
  // `activeTab` makes the URL readable for this click.
  const origin = new URL(tab.url!).origin;
  // Requested before any other await, while the click still counts as a user
  // gesture.
  const granted = await chrome.permissions.request({
    origins: [`${origin}/*`],
  });
  if (granted) {
    await syncContentScript();
    await chrome.tabs.reload(tab.id!);
  }
});
chrome.runtime.onInstalled.addListener(syncContentScript);
chrome.permissions.onAdded.addListener(syncContentScript);
chrome.permissions.onRemoved.addListener(syncContentScript);

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
