import { parseVersion, releasesUrl, latestReleaseUrl } from './release';

// Updating the installed wallet from the About screen, per platform.
//
//   chrome   A browser-managed install (a store) is asked to check now and
//            reloaded once the update is in. One loaded unpacked from a ZIP is
//            never updated by the browser and cannot rewrite its own files: the
//            new ZIP is downloaded, to unzip over the old folder and reload.
//   firefox  The signed package names an update manifest (`update_url`), so
//            the browser can check now and reload. Failing that, opening the
//            new .xpi installs it over this one.
//   android  The new APK is opened; Android installs it in place when it is
//            signed with the same key.
//   ios      A sideloaded app is re-signed by AltStore or Sideloadly, so the
//            release page is opened for them.
//
// Every URL is built from the version alone, parsed to three numbers, and the
// repository constant: nothing the release response says is followed
// (./release.js). Asset names are the ones CI publishes
// (.github/workflows/build-and-release.yml).
//
// Reloading ends whatever the popup was doing. A block already signed is in the
// transaction journal (wallet/journal.js) and is settled on the next unlock.

/* eslint-disable no-undef */

const platforms = ['chrome', 'firefox', 'android', 'ios'];
const platform = platforms.includes(process.env.SYRIUS_PLATFORM) ? process.env.SYRIUS_PLATFORM : 'chrome';

// How long to wait for a found update to finish downloading before saying so.
const installWaitMs = 30 * 1000;

const assetNames = {
  chrome: (version) => `syrius-extension-${version}-chrome-brave.zip`,
  firefox: (version) => `syrius-extension-${version}-firefox.xpi`,
  android: (version) => `syrius-${version}-android.apk`,
};

// The file to download for `version` on `target`, or the release page where
// there is no single file to open.
const downloadUrl = (version, target = platform) => {
  const parsed = parseVersion(version);
  if (!parsed) return latestReleaseUrl;
  const exact = parsed.join('.');
  const name = assetNames[target];
  return name ? `${releasesUrl}/download/v${exact}/${name(exact)}` : `${releasesUrl}/tag/v${exact}`;
};

// 'normal' for a browser-managed install, 'development' for an unpacked one,
// 'unknown' when the browser will not say. Needs no permission.
const installType = async () => {
  try {
    const self = await new Promise((resolve, reject) => {
      chrome.management.getSelf((info) => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(info)));
    });
    return typeof self?.installType === 'string' ? self.installType : 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

// Chrome answers with a result object, older Chrome and Firefox's `chrome`
// namespace with the status as the first argument.
const statusOf = (value) =>
  (typeof value === 'string' ? value : Array.isArray(value) ? value[0] : value?.status) || 'failed';

// 'update_available', 'no_update', 'throttled' or 'failed'.
const requestCheck = () => new Promise((resolve) => {
  try {
    chrome.runtime.requestUpdateCheck((value) => resolve(chrome.runtime.lastError ? 'failed' : statusOf(value)));
  } catch (error) {
    resolve('failed');
  }
});

// Waits for the downloaded update to be ready: `promise` resolves true then,
// or false after the wait. `cancel` stops listening when no update came.
const updateReady = () => {
  let timer = null;
  let finish = () => {};
  const promise = new Promise((resolve) => {
    const ready = () => finish(true);
    finish = (value) => {
      clearTimeout(timer);
      chrome.runtime.onUpdateAvailable.removeListener(ready);
      resolve(value);
    };
    timer = setTimeout(() => finish(false), installWaitMs);
    // Before the check, so an update that is ready at once is not missed.
    chrome.runtime.onUpdateAvailable.addListener(ready);
  });
  return { promise, cancel: () => finish(false) };
};

// The browser's own update, for an install it manages: 'reloading', 'pending'
// (found, applies when the browser next restarts the extension), 'not-yet'
// (nothing offered yet), 'throttled' or 'failed'.
const browserUpdate = async (reload) => {
  const ready = updateReady();
  const status = await requestCheck();
  if (status !== 'update_available') {
    ready.cancel();
    if (status === 'no_update') return 'not-yet';
    return status === 'throttled' ? 'throttled' : 'failed';
  }
  if (!(await ready.promise)) return 'pending';
  reload();
  return 'reloading';
};

// What to do about `version`: { result, url }. `result` is one of the above,
// or 'download' (open `url`, then the platform installs it) or 'unzip' (open
// `url`, then unzip it over the unpacked folder and reload).
const updateNow = async (version, { target = platform, reload = () => chrome.runtime.reload() } = {}) => {
  const url = downloadUrl(version, target);
  if (target === 'android' || target === 'ios') return { result: 'download', url };
  if ((await installType()) === 'normal') {
    const result = await browserUpdate(reload);
    // Firefox installs an opened .xpi over this one; a store cannot be helped.
    if (target === 'firefox' && (result === 'not-yet' || result === 'failed')) return { result: 'download', url };
    return { result, url: null };
  }
  return { result: target === 'chrome' ? 'unzip' : 'download', url };
};

export { platform, installType, statusOf, downloadUrl, updateNow };
