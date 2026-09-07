/**
 * Expose the Zenon provider in the page's MAIN world.
 *
 * The content script and service worker remain the trust boundary. This object
 * only transports requests and events; it never receives a key, password or
 * wallet session material.
 */
(() => {
  const inboundTarget = 'znn-inpage';
  const outboundTarget = 'znn-contentscript';
  const requestTimeoutMs = 30 * 60 * 1000;
  const pending = new Map();
  const listeners = new Map();
  const supportedMethods = new Set([
    'znn_accounts',
    'znn_chainId',
    'znn_nodeUrl',
    'znn_connect',
    'znn_disconnect',
    'znn_sendTransaction',
    'znn_signAndSendBlock',
    'eth_accounts',
    'eth_chainId',
    'eth_requestAccounts',
  ]);
  let requestCounter = 0;

  const existingProvider = window.zenon;
  if (existingProvider
    && !existingProvider.isSyriusExtension
    && typeof existingProvider.request === 'function') {
    return;
  }

  const nextId = () => {
    requestCounter += 1;
    return `znn-${Date.now().toString(36)}-${requestCounter}`;
  };

  const request = ({ method, params } = {}) => new Promise((resolve, reject) => {
    if (typeof method !== 'string' || !supportedMethods.has(method)) {
      reject({ code: 4200, message: 'Unsupported method' });
      return;
    }

    const id = nextId();
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject({ code: 4900, message: 'The wallet did not respond' });
    }, requestTimeoutMs);

    pending.set(id, { resolve, reject, timer });

    try {
      window.postMessage({
        target: outboundTarget,
        kind: 'request',
        id,
        method,
        params,
      }, window.location.origin);
    } catch {
      pending.delete(id);
      window.clearTimeout(timer);
      reject({ code: -32603, message: 'The wallet could not complete the request' });
    }
  });

  const emit = (eventName, data) => {
    const eventHandlers = listeners.get(eventName);
    if (!eventHandlers) {
      return;
    }

    [...eventHandlers].forEach((handler) => {
      try {
        handler(data);
      } catch {
        // A page listener must not be able to interrupt provider delivery.
      }
    });
  };

  const provider = {
    isSyriusExtension: true,
    isZenon: true,
    version: 2,
    accounts: [],
    chainId: null,
    request,

    async connect() {
      const accounts = await request({ method: 'znn_connect' });
      provider.accounts = Array.isArray(accounts) ? accounts : [];
      return provider.accounts;
    },

    async disconnect() {
      await request({ method: 'znn_disconnect' });
      provider.accounts = [];
      return true;
    },

    async getAccounts() {
      provider.accounts = (await request({ method: 'znn_accounts' })) || [];
      return provider.accounts;
    },

    async getChainId() {
      provider.chainId = await request({ method: 'znn_chainId' });
      return provider.chainId;
    },

    async getNodeUrl() {
      return request({ method: 'znn_nodeUrl' });
    },

    async isConnected() {
      return (await provider.getAccounts()).length > 0;
    },

    sendTransaction({ to, tokenStandard, amount }) {
      return request({
        method: 'znn_sendTransaction',
        params: { to, tokenStandard, amount },
      });
    },

    sendAccountBlock(block) {
      return request({ method: 'znn_signAndSendBlock', params: block });
    },

    on(eventName, handler) {
      if (typeof handler !== 'function') {
        return provider;
      }

      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(handler);
      return provider;
    },

    removeListener(eventName, handler) {
      listeners.get(eventName)?.delete(handler);
      return provider;
    },
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (!message || message.target !== inboundTarget) {
      return;
    }

    if (message.kind === 'response') {
      const waiting = pending.get(message.id);
      if (!waiting) {
        return;
      }

      pending.delete(message.id);
      window.clearTimeout(waiting.timer);
      if (message.error) {
        waiting.reject(message.error);
      } else {
        waiting.resolve(message.result);
      }
      return;
    }

    if (message.kind === 'event') {
      if (message.event === 'accountsChanged') {
        provider.accounts = Array.isArray(message.data) ? message.data : [];
      }
      if (message.event === 'chainChanged') {
        provider.chainId = message.data;
      }
      emit(message.event, message.data);
    }
  });

  try {
    Object.defineProperty(window, 'zenon', {
      value: provider,
      writable: false,
      configurable: false,
    });
  } catch {
    // A host page may have a non-configurable placeholder. Leave it intact.
  }

  window.dispatchEvent(new Event('zenon#initialized'));
})();
