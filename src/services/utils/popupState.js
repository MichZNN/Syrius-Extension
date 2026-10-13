import { useCallback, useEffect, useState } from 'react';

// Where the popup was, and what was typed into it, across the popup closing.
//
// The browser closes the toolbar popup the moment it loses focus: a click on
// the page behind it, or a switch to another window to copy an address. It
// used to reopen on Home with every form empty. Now it reopens on the screen it
// was on, with what had been typed.
//
// Only while the same unlock lasts. The record names the session lease it was
// written under (wallet/vault.js); an inactivity lock or a manual one ends
// that lease, and the next unlock finds nothing to restore. It lives in
// `chrome.storage.session`: memory only, readable by this extension's own
// pages and not by its content scripts, gone when the browser closes.
//
// A form opts in field by field (usePopupState). Passwords, phrases and
// anything secret are never passed here.

/* eslint-disable no-undef */

const storageKey = 'popupState';
// Writes are gathered: one per pause in typing, not one per keystroke.
const writeDelayMs = 250;

// What was read at startup, then kept current in memory, and the vault whose
// lease it belongs to (handed over by wallet/bootstrap.js, so that this module
// imports no wallet code of its own).
let record = null;
let timer = null;
let vault = null;

const area = () => {
  try {
    return chrome.storage.session;
  } catch (error) {
    return null;
  }
};

const empty = (lease) => ({ lease, trail: [], fields: {} });

const flush = () => {
  clearTimeout(timer);
  timer = null;
  const storage = area();
  if (!storage || !record) return;
  storage.set({ [storageKey]: record }).catch(() => {});
};

const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, writeDelayMs);
};

// A value that survives JSON, or undefined. Location state can hold class
// instances from the SDK; those are left behind rather than half-copied.
const plain = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return undefined;
  }
};

// Reads the record for the lease now open. Called by the unlock, before the
// screens render, with the vault. A record from another lease is discarded.
const load = async (unlocked) => {
  if (unlocked && unlocked !== vault) {
    vault = unlocked;
    if (typeof vault.onLock === 'function') vault.onLock(clear);
  }
  const lease = vault?.getLeaseId?.() ?? null;
  const storage = area();
  record = empty(lease);
  if (!lease || !storage) return record;
  try {
    const stored = (await storage.get(storageKey))[storageKey];
    if (stored && stored.lease === lease && stored.fields && typeof stored.fields === 'object') {
      record = { lease, trail: Array.isArray(stored.trail) ? stored.trail : [], fields: stored.fields };
    } else if (stored) {
      await storage.remove(storageKey);
    }
  } catch (error) {
    // Nothing to restore is the same as a fresh popup.
  }
  return record;
};

// Everything goes when the wallet locks, whoever locked it.
function clear() {
  clearTimeout(timer);
  timer = null;
  record = null;
  area()?.remove(storageKey).catch(() => {});
}

const current = () => (record && vault && record.lease === vault.getLeaseId?.() ? record : null);

// The screens to reopen on, oldest first: [{ pathname, state }], the last one
// shown. Reopening rebuilds them as history, so Back walks the same way it
// did before the popup closed; with only the last one, Back had nowhere to go.
const maxTrail = 12;
const savedTrail = () => current()?.trail || [];

// `index` is where this screen sits in the popup's history (the router keeps
// it in history.state.idx): what was after it is gone, as in the browser.
const saveRoute = (pathname, state, index) => {
  const open = current();
  if (!open) return;
  const at = Number.isInteger(index) && index >= 0 ? index : (open.trail || []).length;
  const trail = (open.trail || []).slice(0, at);
  trail.push({ pathname, state: plain(state) ?? null });
  open.trail = trail.slice(-maxTrail);
  schedule();
};

const readField = (key) => current()?.fields[key];

const writeField = (key, value) => {
  const open = current();
  if (!open) return;
  const kept = plain(value);
  if (kept === undefined) delete open.fields[key];
  else open.fields[key] = kept;
  schedule();
};

// The browser gives a closing popup no time for a timer: write at once.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flush);
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

// useState that is put back when the popup reopens. `key` names the field
// across the whole popup ('send.amount'); `initial` is used when nothing was
// kept. A form's reset sets the initial value again, which is kept too.
const usePopupState = (key, initial) => {
  const [value, setValue] = useState(() => {
    const kept = readField(key);
    return kept === undefined ? (typeof initial === 'function' ? initial() : initial) : kept;
  });
  useEffect(() => { writeField(key, value); }, [key, value]);
  const set = useCallback((next) => setValue(next), []);
  return [value, set];
};

export { load, clear, savedTrail, saveRoute, readField, writeField, usePopupState, flush };
export default usePopupState;
