import { AppLauncher } from '@capacitor/app-launcher';
import { base64url } from './linkRoutes';
import { limits } from '../services/utils/approvalLimits';

// Another app asking for a signature, through the wallet's own approval flow.
//
// In the extension a site's request comes from its content script
// (sections/Content), which the background trusts for nothing but the private
// tokens it made up, and answers through tabs.sendMessage to exactly that
// document. Here the request comes from a syrius://request link
// (./linkRoutes.js), and this file plays the content script: one document per
// request, with its own document ID, activation and request token, and the
// callback's origin as the site. The background, the queue, the approval
// screen and consent are the extension's, unchanged: a request from an app
// that has not connected is refused as a site's is, and every signature is
// shown and answered by a person.
//
// The answer is opened as the callback with `id` and `result` or `error`
// (base64url JSON) added to its query. Only the callback's origin can receive
// it, which is why that origin is the requester's identity.

let nextTab = 1000;
const token = () => crypto.randomUUID();

const callbackWith = (callback, id, answer) => {
  const url = new URL(callback);
  url.searchParams.set('id', String(id));
  if (answer.error) url.searchParams.set('error', base64url.encode(JSON.stringify({ code: answer.error.code, message: answer.error.message })));
  else url.searchParams.set('result', base64url.encode(JSON.stringify(answer.result ?? null)));
  return url.toString();
};

const startAppRequest = (host, { method, params, id, callback, origin }) => {
  const tabId = nextTab;
  nextTab += 1;
  const documentId = token().replace(/-/g, '').toUpperCase();
  const activation = token();
  const requestToken = token();
  let settled = false;
  let timer = null;

  const finish = (answer) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    host.close(tabId);
    AppLauncher.openUrl({ url: callbackWith(callback, id, answer) }).catch(() => {});
  };

  // What the background sends to the document (documentBinding.deliver).
  const receive = (message) => {
    const current = message.activation === activation;
    let accepted = false;
    if (message.kind === 'probe') {
      accepted = current && (!message.requireRequest || (!settled && message.requestToken === requestToken));
    } else if (message.kind === 'response' && current && message.requestToken === requestToken && !settled) {
      // An answer after its deadline is an unknown outcome, as in the relay.
      const late = !message.error && Number.isFinite(message.expiresAt) && Date.now() >= message.expiresAt;
      const answer = late
        ? { error: { code: -32603, message: 'Approval expired. The outcome is unknown; verify it before retrying.' } }
        : message;
      accepted = !answer.error;
      finish(answer);
    } else if (message.kind === 'event' && current) {
      accepted = true;
    }
    return { accepted, acceptedAt: Date.now() };
  };

  host.open({ tabId, documentId, receive });
  const sender = {
    id: chrome.runtime.id,
    tab: { id: tabId, windowId: 1, title: origin, favIconUrl: '' },
    frameId: 0,
    documentId,
    url: callback,
    origin,
  };
  host.post({ channel: 'znn', kind: 'request', id, method, params, activation, requestToken }, sender)
    .then((response) => {
      if (response?.accepted !== true) {
        finish({ error: response?.error || { code: 4900, message: 'The wallet did not accept the request.' } });
      }
    }, () => finish({ error: { code: 4900, message: 'The wallet did not answer.' } }));
  // The relay's own fallback: the background's approval deadline, and a minute.
  timer = setTimeout(() => finish({ error: { code: 4900, message: 'The wallet did not finish. Verify the outcome before retrying.' } }), limits.ttl + 60000);
};

export { startAppRequest, callbackWith };
