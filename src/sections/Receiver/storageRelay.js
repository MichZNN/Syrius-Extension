// Chrome gives an offscreen document chrome.runtime and nothing else, but the
// wallet's session lives in chrome.storage.session (wallet/sessionLease.js).
// Here the receiver page asks the service worker for it instead, which answers
// this page and no other (sections/Background/receiver.js).
//
// Imported first, so it is in place before any module that reads storage is
// evaluated. Firefox's receiver is an ordinary extension page with storage of
// its own, and is left alone.
import { fail } from '../../services/utils/errors';

if (!chrome.storage) {
  const call = async (method, value) => {
    const answer = await chrome.runtime.sendMessage({ channel: 'syrius-receiver', method, value });
    // sessionLease reports any failure here as the session being unavailable.
    if (!answer || answer.error) throw fail(131);
    return answer.result;
  };
  chrome.storage = {
    session: {
      get: (keys) => call('get', keys),
      set: (items) => call('set', items),
      remove: (keys) => call('remove', keys),
    },
    // Changes are not relayed: the vault checks the session on every use, and
    // a lock is seen there.
    onChanged: { addListener: () => {}, removeListener: () => {} },
  };
}
