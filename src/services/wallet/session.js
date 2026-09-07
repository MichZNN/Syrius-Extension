import { getSettings } from '../utils/storage';

// Keeping the wallet unlocked between popup opens.
//
// A popup is destroyed the moment it loses focus, so without somewhere to put
// the unlocked state the password would have to be typed again on every single
// open. The old build put it in a `const walletCredentials = {...}` at the top
// of the background script, which was wrong twice over:
//
//   - Under manifest v3 the background is a service worker that is unloaded
//     when idle, taking every module-level variable with it. The unlock
//     survived for as long as Chrome felt like keeping the worker alive, which
//     is why the password prompt reappeared at random.
//   - It held the wallet password in plain text and handed it to any sender
//     that asked, with no check on who was asking (finding #2 of the audit).
//
// `chrome.storage.session` is the store for this: it lives in memory, never
// touches disk, is cleared when the browser closes, and its default access
// level keeps content scripts out. What goes in is the keystore's entropy
// rather than the password — it unlocks the same wallet without a key
// derivation run, and it is not a secret the person may have reused elsewhere.

const sessionKey = 'znn.unlock';

// The deadline is stored as an absolute time rather than recomputed from
// settings on each read, because the background service worker also has to be
// able to expire a session and it has no `localStorage` to read settings from.
const deadlineFromNow = () => {
  const { autoLockMinutes } = getSettings();

  // Zero means "lock as soon as the popup closes", which is a real preference.
  return autoLockMinutes > 0 ? Date.now() + autoLockMinutes * 60 * 1000 : 0;
};

const readRaw = async () => {
  try {
    const stored = await chrome.storage.session.get(sessionKey);
    return stored[sessionKey] || null;
  } catch (err) {
    return null;
  }
};

const clear = async () => {
  try {
    await chrome.storage.session.remove(sessionKey);
  } catch (err) {
    // Nothing useful to do; the popup treats it as locked either way.
  }
};

const save = async ({ walletName, entropy, selectedAddressIndex = 0 }) => {
  try {
    await chrome.storage.session.set({
      [sessionKey]: {
        walletName,
        entropy,
        selectedAddressIndex,
        lastActiveAt: Date.now(),
        expiresAt: deadlineFromNow(),
      },
    });
    return true;
  } catch (err) {
    return false;
  }
};

// Returns the stored unlock, or null when there is none or it has gone stale.
// An expired session is removed on the way out rather than left to rot.
const load = async () => {
  const unlock = await readRaw();

  if (!unlock || !unlock.walletName || !unlock.entropy) {
    return null;
  }
  if (!unlock.expiresAt || Date.now() > unlock.expiresAt) {
    await clear();
    return null;
  }
  return unlock;
};

// Pushes the auto-lock deadline out. Called as the popup opens and whenever the
// selected address changes, so the stored index stays in step too.
const touch = async (patch = {}) => {
  const unlock = await readRaw();

  if (!unlock) {
    return false;
  }
  return save({ ...unlock, ...patch });
};

//
// The parts of the unlocked state that are not secret: the address a site would
// be told about, the chain blocks are signed for, the node in use. The
// background service worker needs these to answer a page without holding key
// material or linking the 5 MiB SDK into itself, so the popup publishes them
// here and the worker only ever reads.
//
const publicStateKey = 'znn.publicState';

const publish = async (publicState) => {
  try {
    await chrome.storage.session.set({ [publicStateKey]: publicState });
    return true;
  } catch (err) {
    return false;
  }
};

const unpublish = async () => {
  try {
    await chrome.storage.session.remove(publicStateKey);
  } catch (err) {
    // Ignored.
  }
};

const session = { load, save, touch, clear, publish, unpublish, sessionKey, publicStateKey };

export default session;
