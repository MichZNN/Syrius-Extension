import sessionLease from '../../services/wallet/sessionLease';

// Keeps the receiver page (sections/Receiver) open while a timed unlock lasts,
// and closes it when the wallet locks, so incoming blocks are received while
// the popup is closed (wallet/backgroundReceive.js).
//
// Chrome: an offscreen document, the one extension page a service worker can
// open without a window, and the one place proof of work can start workers.
// It has chrome.runtime only, so its session storage comes through here, to
// that page alone. Firefox: an iframe in the background page, which is an
// ordinary extension page; when Firefox suspends the background, the next
// minute's alarm brings both back.
//
// On close keeps no key outside the popup, so it never opens a receiver.

const path = 'receiver.html';
const frameId = 'syrius-receiver';

// The browser sets these: an extension page, at the receiver's own address,
// in no tab. A content script's sender has the site's URL and a tab.
const fromReceiver = (sender) => sender?.id === chrome.runtime.id && !sender.tab &&
  sender.url === chrome.runtime.getURL(path);

const wanted = async () => {
  try {
    const record = (await chrome.storage.session.get(sessionLease.sessionKey))[sessionLease.sessionKey];
    return sessionLease.live(record) && record.mode === 'timed';
  } catch (error) {
    return false;
  }
};

// The app is one page, which receives for itself (layouts/tabsLayout).
// Read with care: the browser suites load this file as a plain module, with no
// bundler to fill `process` in.
const platform = typeof process !== 'undefined' ? process.env.SYRIUS_PLATFORM : undefined;
const isApp = ['android', 'ios'].includes(platform);

const apply = async () => {
  if (isApp) return;
  const want = await wanted();
  if (chrome.offscreen) {
    // Creating one that exists, or closing one that does not, is refused;
    // either way the state asked for is the state there is.
    // The WORKERS reason is Chrome 113's; the manifest allows 112 (issue #43).
    // There the page is not asked for: with no background page the popup does
    // the work itself, as it does with On close (wallet/blockService.js).
    if (want && !chrome.offscreen.Reason?.WORKERS) return;
    if (want) {
      await chrome.offscreen.createDocument({
        url: path,
        reasons: ['WORKERS'],
        justification: 'Receives incoming transfers while the wallet is unlocked; proof of work runs in workers.',
      }).catch(() => {});
    } else {
      await chrome.offscreen.closeDocument().catch(() => {});
    }
    return;
  }
  if (typeof document === 'undefined') return;
  const frame = document.getElementById(frameId);
  if (want && !frame) {
    const created = document.createElement('iframe');
    created.id = frameId;
    created.src = chrome.runtime.getURL(path);
    document.body.append(created);
  } else if (!want && frame) {
    frame.remove();
  }
};

// One at a time: a lock and an unlock in quick succession end in the right state.
let queue = Promise.resolve();
const syncReceiver = () => {
  queue = queue.then(apply, apply).catch(() => {});
  return queue;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.channel !== 'syrius-receiver') return false;
  if (!fromReceiver(sender) || !['get', 'set', 'remove'].includes(message.method)) {
    sendResponse({ error: 'Not allowed' });
    return false;
  }
  chrome.storage.session[message.method](message.value)
    .then((result) => sendResponse({ result }), (error) => sendResponse({ error: String(error?.message || error) }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[sessionLease.sessionKey]) syncReceiver();
});

export default syncReceiver;
