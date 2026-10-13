// Which version this is, and whether a newer one has been released.
//
// The extension is installed from a ZIP, so the browser never updates it. The
// lock screen and the About screen ask GitHub for the newest release's tag and
// compare; the six-hour cache below is shared, so opening both costs one ask. The
// request names the repository and nothing about the wallet; it is listed in
// privacy-policy.md.
//
// Only the tag is read, and only when it is exactly a version. The link to
// the releases page is the constant below, never anything the response says,
// so a tampered answer can claim an update exists and do nothing else.
//
// Checked in utils/operator-mode-test.js.

const repositoryUrl = 'https://github.com/sol-znn/syrius-extension';
const releasesUrl = `${repositoryUrl}/releases`;
const latestReleaseUrl = `${releasesUrl}/latest`;
const privacyUrl = `${repositoryUrl}/blob/HEAD/privacy-policy.md`;
const latestUrl = 'https://api.github.com/repos/sol-znn/syrius-extension/releases/latest';

// GitHub allows an address 60 unauthenticated requests an hour; one answer is
// kept for six.
const cacheKey = 'releaseCheck';
const cacheFor = 6 * 60 * 60 * 1000;

// [major, minor, patch], or null for anything that is not exactly that.
const parseVersion = (text) => {
  const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(typeof text === 'string' ? text.trim() : '');
  return match ? match.slice(1).map(Number) : null;
};

const isNewer = (candidate, current) => {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
};

const currentVersion = () => {
  try {
    // eslint-disable-next-line no-undef
    return chrome.runtime.getManifest().version;
  } catch (error) {
    return '';
  }
};

const readCache = (now) => {
  try {
    const kept = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    return kept && parseVersion(kept.version) && now - kept.at >= 0 && now - kept.at < cacheFor ? kept.version : null;
  } catch (error) {
    return null;
  }
};

// The newest released version as "1.2.3", or null when it could not be learnt.
const latestVersion = async ({ fetcher = fetch, now = Date.now() } = {}) => {
  const kept = readCache(now);
  if (kept) return kept;
  try {
    const response = await fetcher(latestUrl, { headers: { accept: 'application/vnd.github+json' } });
    if (!response.ok) return null;
    const parsed = parseVersion((await response.json())?.tag_name);
    if (!parsed) return null;
    const version = parsed.join('.');
    try { localStorage.setItem(cacheKey, JSON.stringify({ at: now, version })); } catch (error) { /* asked again next time */ }
    return version;
  } catch (error) {
    return null;
  }
};

// 'update', 'current' or 'unknown'.
const releaseState = (latest, current) => {
  if (!parseVersion(latest) || !parseVersion(current)) return 'unknown';
  return isNewer(latest, current) ? 'update' : 'current';
};

export { repositoryUrl, releasesUrl, latestReleaseUrl, privacyUrl, latestUrl, parseVersion, isNewer, currentVersion, latestVersion, releaseState };
