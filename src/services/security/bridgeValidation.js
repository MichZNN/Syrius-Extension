import { isSafeRawTokenAmount } from './amounts';

/**
 * Validate data crossing the page/content-script boundary before it reaches
 * the wallet UI or the signing code.
 */
const MAX_BRIDGE_PAYLOAD_LENGTH = 128 * 1024;
const MAX_BRIDGE_STRING_LENGTH = 256;
const MAX_BRIDGE_AMOUNT_LENGTH = 20;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  try {
    const prototype = Object.getPrototypeOf(value);

    // The first-world page and the isolated content-script world can have
    // different Object.prototype instances. Accept both plain cross-realm
    // objects and null-prototype objects, but reject class instances.
    return prototype === null
      || (Object.prototype.toString.call(value) === '[object Object]'
        && Object.getPrototypeOf(prototype) === null);
  } catch {
    return false;
  }
};

const hasSafeObjectKeys = (value, depth = 0) => {
  if (depth > 12) {
    return false;
  }

  if (value === null) {
    return true;
  }

  if (typeof value === 'undefined'
    || typeof value === 'function'
    || typeof value === 'symbol'
    || typeof value === 'bigint'
    || (typeof value === 'number' && !Number.isFinite(value))) {
    return false;
  }

  if (Array.isArray(value)) {
    try {
      return value.length <= 1024
        && value.every((item) => hasSafeObjectKeys(item, depth + 1));
    } catch {
      return false;
    }
  }

  if (!isPlainObject(value)) {
    return typeof value !== 'object';
  }

  try {
    const entries = Object.entries(value);
    return entries.length <= 1024 && entries.every(([key, item]) => (
      key !== '__proto__'
      && key !== 'constructor'
      && key !== 'prototype'
      && hasSafeObjectKeys(item, depth + 1)
    ));
  } catch {
    return false;
  }
};

const isWithinPayloadLimit = (value) => {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      && serialized.length <= MAX_BRIDGE_PAYLOAD_LENGTH;
  } catch {
    return false;
  }
};

/** Return whether a value can cross the bridge without exceeding its limit. */
export const isSafeBridgePayload = (value) => (
  hasSafeObjectKeys(value) && isWithinPayloadLimit(value)
);

const isSafeString = (value, maxLength = MAX_BRIDGE_STRING_LENGTH) => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= maxLength
);

const SAFE_BRIDGE_ERROR_MESSAGES = new Set([
  'User denied wallet read',
  'User denied transaction signing',
  'User denied sending account block',
]);

/** Return whether a bridge error is one of the extension's fixed messages. */
export const isSafeBridgeError = (value) => (
  typeof value === 'string' && SAFE_BRIDGE_ERROR_MESSAGES.has(value)
);

/**
 * Amounts received from the bridge are raw token units. They must be positive
 * decimal integers that remain exactly representable by the SDK's number API.
 */
export const isSafeBridgeAmount = (value) => {
  const amount = typeof value === 'number' ? String(value) : value;

  return isSafeString(amount, MAX_BRIDGE_AMOUNT_LENGTH)
    && /^[1-9]\d*$/.test(amount)
    && isSafeRawTokenAmount(amount);
};

const validateTransactionRequest = (params) => {
  if (!isPlainObject(params) || !hasSafeObjectKeys(params)) {
    return false;
  }

  const keys = Object.keys(params).sort();
  if (keys.length !== 3 || keys.join(',') !== 'amount,to,tokenStandard') {
    return false;
  }

  return isSafeString(params.to)
    && isSafeString(params.tokenStandard)
    && isSafeBridgeAmount(params.amount)
    && isWithinPayloadLimit(params);
};

const validateAccountBlockRequest = (params) => (
  isPlainObject(params)
  && Object.keys(params).length > 0
  && hasSafeObjectKeys(params)
  && isWithinPayloadLimit(params)
);

/**
 * Return whether a page-originated bridge request has an accepted shape.
 * The background worker repeats this validation because content scripts are
 * not a trust boundary for extension code.
 */
export const isValidBridgeRequest = (message, params) => {
  if (message === 'znn.requestWalletAccess') {
    return params === undefined
      || params === null
      || (isPlainObject(params) && Object.keys(params).length === 0);
  }

  if (message === 'znn.sendTransactionToSigning') {
    return validateTransactionRequest(params);
  }

  if (message === 'znn.sendAccountBlockToSend') {
    return validateAccountBlockRequest(params);
  }

  return false;
};
