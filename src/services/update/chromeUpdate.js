import { readZip } from './zip';
import { isNewer, parseVersion, releasesUrl } from '../utils/release';
import { fail } from '../utils/errors';

// Updating an unpacked Chrome or Brave install in place.
//
// The browser never updates an extension loaded from a folder, and an
// extension cannot write to its own files. What it can do, with the person's
// say-so, is write to a folder they pick (the File System Access API). So the
// person picks the folder the extension was loaded from, once; the handle is
// remembered here and asked about again only when the browser has dropped
// its permission. An update then downloads the release ZIP, checks it, writes
// it over the folder and reloads the extension.
//
// What is checked before anything is written:
//   - the folder is this extension: its manifest.json has this extension's
//     name, so a wrong pick is refused rather than overwritten;
//   - the ZIP's SHA-256 matches the .sha256 file published beside it;
//   - every entry passes its CRC and has a plain relative name (./zip.js);
//   - the ZIP's manifest names this extension and exactly the version asked
//     for, and that version is newer than this one.
// The download URL is built from the parsed version and the repository
// constant, never from anything a response says (../utils/release.js). The
// ZIP is trusted as far as the release page is: this does by hand's work, it
// adds no source of code a manual download did not have.
//
// manifest.json is written last, so an interrupted write leaves the old
// manifest naming files that are mostly new; running Update again rewrites
// everything.

/* eslint-disable no-undef */

const dbName = 'syrius-update';
const storeName = 'prefs';
const folderKey = 'folder';

// The hosts a release download goes through. Asked for at the moment of
// updating (optional_host_permissions), not held by every install.
const downloadOrigins = [
  'https://github.com/*',
  'https://objects.githubusercontent.com/*',
  'https://release-assets.githubusercontent.com/*',
];

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(dbName, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(storeName);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const withStore = async (mode, operation) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const result = operation(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

// The remembered folder handle, or null.
const savedFolder = async () => {
  try {
    return (await withStore('readonly', (store) => store.get(folderKey))) || null;
  } catch (error) {
    return null;
  }
};

const rememberFolder = (handle) => withStore('readwrite', (store) => store.put(handle, folderKey));

// Forgets the folder and gives back the download permission: the reset in
// About. The next update asks for both again.
const resetUpdatePrefs = async () => {
  await withStore('readwrite', (store) => store.delete(folderKey)).catch(() => {});
  try {
    await chrome.permissions.remove({ origins: downloadOrigins });
  } catch (error) {
    // Not held, or the browser will not say: nothing to give back.
  }
};

const readJsonFile = async (folder, name) => {
  try {
    const file = await (await folder.getFileHandle(name)).getFile();
    return JSON.parse(await file.text());
  } catch (error) {
    return null;
  }
};

// Whether `folder` is where this extension was loaded from, as far as its
// manifest can say.
const isThisExtension = async (folder, manifest = chrome.runtime.getManifest()) => {
  const theirs = await readJsonFile(folder, 'manifest.json');
  return Boolean(theirs && theirs.name === manifest.name && theirs.manifest_version === manifest.manifest_version &&
    parseVersion(theirs.version));
};

// Read and write on `folder`, asking if the browser has dropped it. Must run
// inside a click: the browser asks the person only then.
const ensureWritable = async (folder) => {
  const mode = { mode: 'readwrite' };
  if ((await folder.queryPermission(mode)) === 'granted') return true;
  return (await folder.requestPermission(mode)) === 'granted';
};

// The picker, a check that the pick is this extension, and remembering it.
const chooseFolder = async ({ picker = (options) => window.showDirectoryPicker(options) } = {}) => {
  const folder = await picker({ id: 'syrius-extension', mode: 'readwrite' });
  if (!(await isThisExtension(folder))) {
    throw fail(120, undefined, { code: 'UPDATE_WRONG_FOLDER' });
  }
  await rememberFolder(folder);
  return folder;
};

const archiveName = (version) => `syrius-extension-${version}-chrome-brave.zip`;
const releaseBase = (version) => `${releasesUrl}/download/v${version}`;

const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

// The release ZIP for `version`, checked against its published SHA-256.
const downloadRelease = async (version, { fetcher = fetch, base = releaseBase(version) } = {}) => {
  const name = archiveName(version);
  const [zip, sum] = await Promise.all([fetcher(`${base}/${name}`), fetcher(`${base}/${name}.sha256`)]);
  if (!zip.ok || !sum.ok) throw fail(122, { version }, { code: 'UPDATE_DOWNLOAD' });
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const expected = (await sum.text()).trim().split(/\s+/)[0].toLowerCase();
  const actual = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) {
    throw fail(123, undefined, { code: 'UPDATE_CHECKSUM' });
  }
  return bytes;
};

// The archive's files, once it is shown to be this extension at `version`.
const checkRelease = async (bytes, version, { manifest = chrome.runtime.getManifest() } = {}) => {
  const files = await readZip(bytes);
  const entry = files.find((file) => file.name === 'manifest.json');
  let theirs = null;
  try { theirs = entry && JSON.parse(new TextDecoder().decode(entry.data)); } catch (error) { theirs = null; }
  if (!theirs || theirs.name !== manifest.name || theirs.manifest_version !== manifest.manifest_version) {
    throw fail(124, undefined, { code: 'UPDATE_NOT_THIS' });
  }
  if (theirs.version !== version || !isNewer(theirs.version, manifest.version)) {
    throw fail(125, { found: theirs.version, version }, { code: 'UPDATE_VERSION' });
  }
  return files;
};

const writeFile = async (folder, name, data) => {
  const parts = name.split('/');
  let directory = folder;
  for (const part of parts.slice(0, -1)) {
    // eslint-disable-next-line no-await-in-loop
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  const handle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
};

// Writes the files over `folder`, manifest.json last.
const writeRelease = async (folder, files, onProgress) => {
  const ordered = [...files.filter((file) => file.name !== 'manifest.json'), ...files.filter((file) => file.name === 'manifest.json')];
  for (let index = 0; index < ordered.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await writeFile(folder, ordered[index].name, ordered[index].data);
    onProgress?.(index + 1, ordered.length);
  }
};

// The whole update, from a click. Resolves once written; `reload` then
// restarts the extension on the new files.
const updateFolder = async (version, {
  folder, fetcher, base, onStage = () => {}, reload = () => chrome.runtime.reload(), requestDownload = true,
} = {}) => {
  const exact = parseVersion(version)?.join('.');
  if (!exact) throw fail(126, undefined, { code: 'UPDATE_VERSION' });
  if (requestDownload && !(await chrome.permissions.request({ origins: downloadOrigins }))) {
    throw fail(127, undefined, { code: 'UPDATE_PERMISSION' });
  }
  if (!(await ensureWritable(folder))) throw fail(128, undefined, { code: 'UPDATE_PERMISSION' });
  if (!(await isThisExtension(folder))) {
    throw fail(121, undefined, { code: 'UPDATE_WRONG_FOLDER' });
  }
  onStage('downloading');
  const bytes = await downloadRelease(exact, { fetcher, base });
  onStage('checking');
  const files = await checkRelease(bytes, exact);
  onStage('writing');
  await writeRelease(folder, files, (done, total) => onStage('writing', done, total));
  onStage('reloading');
  reload();
};

export {
  downloadOrigins, savedFolder, rememberFolder, resetUpdatePrefs, isThisExtension, ensureWritable, chooseFolder,
  archiveName, downloadRelease, checkRelease, writeRelease, updateFolder,
};
