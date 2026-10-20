// Chrome runs manifest content scripts only in documents that load after the
// extension does. A page already open when Syrius was installed had no
// `window.zenon` until it was reloaded, so az.zenon.foo, open in Brave while
// the wallet was being installed, answered Connect with "Install the Syrius
// extension". On install and update this gives such pages the relay and the
// provider. Firefox injects into open tabs itself, and the apps have no tabs.
//
// A frame that already has `window.zenon` is left alone. After an update that
// is the previous version's provider, which cannot be replaced (Inpage defines
// it non-configurable), and its orphaned relay answers every request with
// "Reload the page" before a new relay could; injecting beside it would change
// nothing.
const platform = typeof process !== 'undefined' ? process.env.SYRIUS_PLATFORM : undefined;
const web = /^https?:/i;

// Runs in each frame's own world. Reads nothing back but this boolean.
const providerMissing = () => !Object.getOwnPropertyDescriptor(window, 'zenon');

// The manifest names the two scripts, so a renamed bundle cannot drift apart.
const scripts = () => {
  const entries = chrome.runtime.getManifest().content_scripts || [];
  return {
    relay: entries.find(entry => entry.world !== 'MAIN')?.js || [],
    provider: entries.find(entry => entry.world === 'MAIN')?.js || [],
  };
};

// Each injection names the document the check ran in, never just the frame: a
// frame that navigated since gets its scripts from the manifest, and the call
// for the departed document fails instead of landing in the new one.
const injectDocument = async (tabId, documentId, { relay, provider }) => {
  // The relay first: the provider announces itself, and a request made the
  // moment it does must find a relay to carry it.
  await chrome.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, files: relay });
  await chrome.scripting.executeScript({ target: { tabId, documentIds: [documentId] }, files: provider, world: 'MAIN' });
};

const injectTab = async (tabId, files) => {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
  const frameIds = frames.filter(frame => web.test(frame.url || '')).map(frame => frame.frameId);
  if (!frameIds.length) return 0;
  const checked = await chrome.scripting.executeScript({ target: { tabId, frameIds }, world: 'MAIN', func: providerMissing });
  const bare = checked.filter(entry => entry.result === true && typeof entry.documentId === 'string');
  let injected = 0;
  for (const { documentId } of bare) {
    try { await injectDocument(tabId, documentId, files); injected++; }
    catch (error) { /* That document left; its successor has the manifest's scripts. */ }
  }
  return injected;
};

// Resolves to the number of documents given the wallet.
const injectOpenTabs = async ({ reason } = {}) => {
  if (platform !== 'chrome' || typeof chrome.scripting?.executeScript !== 'function') return 0;
  if (reason !== 'install' && reason !== 'update') return 0;
  const files = scripts();
  if (!files.relay.length || !files.provider.length) return 0;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  // A discarded tab reloads when it is next shown, with the manifest's scripts.
  const counts = await Promise.all(tabs.filter(tab => Number.isInteger(tab.id) && !tab.discarded).map(tab =>
    // A page Chrome will not script (the Web Store, an error page) gets the
    // wallet when it next loads.
    injectTab(tab.id, files).catch(() => 0)));
  return counts.reduce((sum, count) => sum + count, 0);
};

export default injectOpenTabs;
export { providerMissing };
