import { fail } from './errors';
// Chrome navigation events survive page-side removal of DOM listeners. Keep
// their generation in session storage so pending approvals survive worker sleep
// but cannot survive a browser navigation, even if a relay misses pagehide.
const storageKey = 'znn.navigation';
const serialized = operation => navigator.locks.request(storageKey, operation);
const read = async () => (await chrome.storage.session.get(storageKey))[storageKey] || {};
const stamp = (state, target) => ({ navigationTab: state[target.tabId]?.epoch || 'initial',
  navigationFrame: state[target.tabId]?.frames?.[target.frameId] || 'initial' });
const same = (a, b) => a.navigationTab === b.navigationTab && a.navigationFrame === b.navigationFrame;
let failed = false;
const write = async state => {
  try { await chrome.storage.session.set({ [storageKey]: state }); }
  catch (error) { failed = true; throw error; }
};

// Firefox reports no documentId for a sender or a frame. There the document is
// the relay's private per-document token (documentBinding.targetFrom), and a
// frame holds at most one admitted token at a time.
//
// A token is admitted only when the frame's current relay answers a probe for
// the activation sent with it. tabs.sendMessage reaches whatever document the
// frame holds now, and that relay answers only its own private activation, so
// a departed document's token (a late hello, a replayed request) is refused,
// and a page, which sees neither token, cannot name another document's. A
// committed navigation in the frame (at the top, in the tab), the relay's bye
// and the tab closing remove the admission; it is never assumed to persist.
const relayDocuments = (typeof process !== 'undefined' ? process.env.SYRIUS_PLATFORM : undefined) === 'firefox';
const probeMs = 2000;
const relayHolds = async target => {
  let timer;
  try {
    const reply = await Promise.race([
      chrome.tabs.sendMessage(target.tabId, { channel: 'znn', kind: 'probe', activation: target.activation },
        { frameId: target.frameId }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), probeMs); }),
    ]);
    return reply?.accepted === true;
  } catch (error) { return false; }
  finally { clearTimeout(timer); }
};
// Runs inside the navigation lock; the probe is a raw message, not deliver(),
// which would wait on this same lock.
const relayDocument = async (target, state) => {
  if (!(await chrome.webNavigation.getFrame({ tabId: target.tabId, frameId: target.frameId }))) return false;
  if (state[target.tabId]?.documents?.[target.frameId] === target.documentId) return true;
  if (!(await relayHolds(target))) return false;
  const entry = state[target.tabId] || { epoch: 'initial', frames: {} };
  entry.documents = { ...entry.documents, [target.frameId]: target.documentId };
  state[target.tabId] = entry;
  await write(state);
  return true;
};
const activeDocument = async (target, state) => {
  if (relayDocuments) return relayDocument(target, state);
  const frame = await chrome.webNavigation.getFrame({ tabId: target.tabId, frameId: target.frameId });
  return frame?.documentId === target.documentId && frame.documentLifecycle === 'active';
};

const capture = target => serialized(async () => {
  const state = await read();
  if (failed || !target || !(await activeDocument(target, state))) throw fail(105);
  return { ...target, ...stamp(state, target) };
});
const matches = target => serialized(async () => {
  if (failed || typeof target?.navigationTab !== 'string' || typeof target?.navigationFrame !== 'string') return false;
  const state = await read();
  return same(target, stamp(state, target)) && await activeDocument(target, state);
}).catch(() => false);
const invalidate = details => serialized(async () => {
  const state = await read();
  const previous = stamp(state, details);
  const entry = state[details.tabId] || { epoch: 'initial', frames: {} };
  if (details.frameId === 0) { entry.epoch = crypto.randomUUID(); entry.frames = {}; }
  else entry.frames[details.frameId] = crypto.randomUUID();
  state[details.tabId] = entry;
  await write(state);
  return request => request.tabId === details.tabId && request.navigationTab === previous.navigationTab &&
    (details.frameId === 0 || (request.frameId === details.frameId && request.navigationFrame === previous.navigationFrame));
}).catch(error => { failed = true; throw error; });
// Firefox: a committed navigation replaced the frame's document (at the top,
// every frame's). Returns which requests and registrations were the removed
// documents'.
const commit = details => serialized(async () => {
  const state = await read();
  const documents = state[details.tabId]?.documents || {};
  const removed = details.frameId === 0 ? { ...documents }
    : Object.hasOwn(documents, details.frameId) ? { [details.frameId]: documents[details.frameId] } : {};
  if (Object.keys(removed).length) {
    const remaining = details.frameId === 0 ? {} : { ...documents };
    if (details.frameId !== 0) delete remaining[details.frameId];
    state[details.tabId] = { ...state[details.tabId], documents: remaining };
    await write(state);
  }
  return request => request.tabId === details.tabId && Object.hasOwn(removed, request.frameId) &&
    removed[request.frameId] === request.documentId;
}).catch(error => { failed = true; throw error; });
// Firefox: the relay left (bye). Only its own admission is removed; the
// frame's next document may already hold the slot.
const release = target => !relayDocuments ? Promise.resolve() : serialized(async () => {
  const state = await read();
  const documents = state[target.tabId]?.documents;
  if (documents?.[target.frameId] !== target.documentId) return;
  delete documents[target.frameId];
  await write(state);
});
const forgetTab = tabId => serialized(async () => {
  const state = await read(); delete state[tabId]; await chrome.storage.session.set({ [storageKey]: state });
});
const nativeNavigation = { relayDocuments, capture, matches, invalidate, commit, release, forgetTab };
export default nativeNavigation;
