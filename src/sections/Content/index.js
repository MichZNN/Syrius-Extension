/**
 * Relay the modern provider and the original Syrius bridge protocol.
 *
 * This isolated-world script never sees passwords or private keys. The service
 * worker derives the request origin from Chrome's sender metadata and repeats
 * all payload validation before any wallet UI is opened.
 */
import {
  isSafeBridgeError,
  isSafeBridgePayload,
  isValidBridgeRequest,
} from '../../services/security/bridgeValidation';
import {
  isSafeProviderRequestId,
  isValidProviderRequest,
  PROVIDER_ERROR,
} from '../../services/security/providerValidation';

const providerTarget = 'znn-inpage';
const contentTarget = 'znn-contentscript';
const providerEvents = new Set([
  'accountsChanged',
  'chainChanged',
  'nodeChanged',
  'disconnect',
]);

const legacyRequestMethods = new Set([
  'znn.requestWalletAccess',
  'znn.sendTransactionToSigning',
  'znn.sendAccountBlockToSend',
]);

const legacyResponseMethods = new Set([
  'znn.grantedWalletRead',
  'znn.deniedWalletRead',
  'znn.signedTransaction',
  'znn.deniedSignTransaction',
  'znn.accountBlockSent',
  'znn.deniedSendAccountBlock',
  'znn.addressChanged',
  'znn.chainIdChanged',
  'znn.nodeChanged',
]);

const isSafeProviderError = (error) => (
  error
  && typeof error === 'object'
  && Number.isInteger(error.code)
  && typeof error.message === 'string'
  && error.message.length > 0
  && error.message.length <= 256
);

const postToPage = (message) => {
  try {
    window.postMessage(message, window.location.origin);
  } catch {
    // Host page APIs are not a trust boundary and may be replaced.
  }
};

const sendToBackground = (message) => {
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The page-side provider will settle the request on its own timeout.
  }
};

sendToBackground({ channel: 'provider', kind: 'hello' });

window.addEventListener('message', (event) => {
  try {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.target === contentTarget && message.kind === 'request') {
      if (!isSafeProviderRequestId(message.id)) {
        return;
      }

      const request = {
        id: message.id,
        method: message.method,
      };
      if (Object.prototype.hasOwnProperty.call(message, 'params')) {
        request.params = message.params;
      }

      if (isValidProviderRequest(request)) {
        sendToBackground({
          channel: 'provider',
          kind: 'request',
          id: request.id,
          method: request.method,
          params: request.params,
        });
      } else {
        postToPage({
          target: providerTarget,
          kind: 'response',
          id: request.id,
          error: PROVIDER_ERROR.internal,
        });
      }
      return;
    }

    if (!legacyRequestMethods.has(message.method)) {
      return;
    }

    const params = Object.prototype.hasOwnProperty.call(message, 'params')
      ? message.params
      : undefined;
    if (!isValidBridgeRequest(message.method, params)) {
      return;
    }

    const request = { message: message.method };
    if (params !== undefined) {
      request.params = params;
    }
    sendToBackground(request);
  } catch {
    // Malformed page data is ignored without exposing extension state.
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender?.id !== chrome.runtime.id || !message || typeof message !== 'object') {
    return false;
  }

  if (message.channel === 'provider') {
    if (message.kind === 'response'
      && isSafeProviderRequestId(message.id)
      && (!Object.prototype.hasOwnProperty.call(message, 'result')
        || isSafeBridgePayload(message.result))
      && (!message.error || isSafeProviderError(message.error))) {
      postToPage({
        target: providerTarget,
        kind: 'response',
        id: message.id,
        result: message.result,
        error: message.error,
      });
    }

    if (message.kind === 'event'
      && providerEvents.has(message.event)
      && (!Object.prototype.hasOwnProperty.call(message, 'data')
        || isSafeBridgePayload(message.data))) {
      postToPage({
        target: providerTarget,
        kind: 'event',
        event: message.event,
        data: message.data,
      });
    }
    return false;
  }

  if (!legacyResponseMethods.has(message.message)) {
    return false;
  }

  const legacyMessage = { method: message.message };
  if (Object.prototype.hasOwnProperty.call(message, 'data')) {
    if (!isSafeBridgePayload(message.data)) {
      return false;
    }
    legacyMessage.data = message.data;
  }
  if (Object.prototype.hasOwnProperty.call(message, 'error')) {
    if (!isSafeBridgeError(message.error)) {
      return false;
    }
    legacyMessage.error = message.error;
  }
  postToPage(legacyMessage);
  return false;
});
