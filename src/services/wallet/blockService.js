// The popup's side of the block service: sends, receives and their proof of
// work run in the background page (sections/Receiver/blockHost.js), so
// closing the popup no longer stops them, and a popup opened later shows them
// still going (components/block-sync).
//
// The background page exists while a timed unlock lasts, in Chrome as an
// offscreen document and in Firefox as an iframe in the background page. With
// On close there is no key outside the popup, so there is no background page,
// and the popup does the work itself as before. So does the app, which is one
// page.
//
// Messages go through chrome.runtime, which reaches the extension's own pages
// only; the host checks the sender is one of them.

const channel = 'syrius-blocks';
const stateChannel = 'syrius-blocks-state';
const isApp = ['android', 'ios'].includes(process.env.SYRIUS_PLATFORM);
// The host says what it holds at least this often; past twice this, it is gone.
const heartbeatMs = 15000;

let hostState = null;
let seenAt = 0;
const listeners = new Set();
const fresh = () => hostState && Date.now() - seenAt < heartbeatMs * 2;
const emit = () => listeners.forEach((listener) => listener(fresh() ? hostState : null));

const accept = (state) => {
  hostState = state;
  seenAt = Date.now();
  emit();
};

if (!isApp && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.channel === stateChannel && sender?.id === chrome.runtime.id && message.state) accept(message.state);
    return false;
  });
}

// One request to the host, or null when there is none to answer.
const ask = async (kind, payload = {}, timeoutMs = 2000) => {
  if (isApp || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  let timer;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage({ channel, kind, ...payload }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch (error) {
    return null; // No page listening.
  } finally {
    clearTimeout(timer);
  }
};

// Whether the host is there to take work, asking it when it has not been heard
// from lately.
const hostReady = async () => {
  if (fresh()) return true;
  const answer = await ask('state');
  if (answer?.state) {
    accept(answer.state);
    return true;
  }
  return false;
};

// `job` as wallet/blockJobs.js takes it, with JSON templates, plus `id` and
// the row the store shows (`row`). Resolves true once the host has it.
const hostSend = async (job) => Boolean((await ask('send', { job }, 5000))?.accepted);
const hostReceive = () => ask('receive');
const hostForget = (ids) => ask('forget', { ids });
const onHostState = (listener) => {
  listeners.add(listener);
  listener(fresh() ? hostState : null);
  return () => listeners.delete(listener);
};
const currentHostState = () => (fresh() ? hostState : null);

export { hostReady, hostSend, hostReceive, hostForget, onHostState, currentHostState, channel, stateChannel, heartbeatMs };
