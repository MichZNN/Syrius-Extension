import { isValidBridgeRequest } from './bridgeValidation';

const PROVIDER_METHODS = new Set([
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

const PROVIDER_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

export const normalizeProviderMethod = (method) => {
  const aliases = {
    eth_accounts: 'znn_accounts',
    eth_chainId: 'znn_chainId',
    eth_requestAccounts: 'znn_connect',
  };
  return aliases[method] || method;
};

export const isSafeProviderRequestId = (id) => (
  typeof id === 'string' && PROVIDER_REQUEST_ID_PATTERN.test(id)
);

const isEmptyParams = (params) => (
  params === undefined
    || params === null
    || (Array.isArray(params) && params.length === 0)
    || (params && typeof params === 'object'
      && !Array.isArray(params)
      && Object.keys(params).length === 0)
);

/** Validate provider input again in the service worker trust boundary. */
export const isValidProviderRequest = (request) => {
  if (!request
    || typeof request !== 'object'
    || !isSafeProviderRequestId(request.id)
    || typeof request.method !== 'string'
    || !PROVIDER_METHODS.has(request.method)) {
    return false;
  }

  const method = normalizeProviderMethod(request.method);
  const params = request.params;

  if (method === 'znn_sendTransaction') {
    return isValidBridgeRequest('znn.sendTransactionToSigning', params);
  }

  if (method === 'znn_signAndSendBlock') {
    return isValidBridgeRequest('znn.sendAccountBlockToSend', params);
  }

  return isEmptyParams(params);
};

export const PROVIDER_ERROR = Object.freeze({
  userRejected: Object.freeze({ code: 4001, message: 'User rejected the request' }),
  unauthorized: Object.freeze({ code: 4100, message: 'The site is not connected to this wallet' }),
  unsupportedMethod: Object.freeze({ code: 4200, message: 'Unsupported method' }),
  disconnected: Object.freeze({ code: 4900, message: 'The wallet is locked' }),
  internal: Object.freeze({ code: -32603, message: 'The wallet could not complete the request' }),
});
