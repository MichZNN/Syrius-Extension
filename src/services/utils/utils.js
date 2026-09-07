import { KeyStoreManager, Primitives } from 'znn-ts-sdk';
import { isWalletSessionActive } from '../security/session';
const memoryPoolPageSize = 50;
const MAX_LOCAL_STORAGE_JSON_LENGTH = 1024 * 1024;
const MAX_ADDRESS_INDEX = 1000;
const RESERVED_WALLET_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/** Read extension metadata without allowing malformed or oversized JSON to crash the UI. */
const readStoredJson = (key, fallback) => {
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null || serialized.length > MAX_LOCAL_STORAGE_JSON_LENGTH) {
      return fallback;
    }

    const parsed = JSON.parse(serialized);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

/** Read a stored JSON array, returning an empty array for invalid metadata. */
const readStoredArray = (key) => {
  const storedValue = readStoredJson(key, []);
  return Array.isArray(storedValue) ? storedValue : [];
};

/**
 * Read a stored JSON record into a null-prototype object to avoid prototype
 * pollution through wallet-controlled metadata keys.
 */
const readStoredRecord = (key, fallback = {}) => {
  const storedValue = readStoredJson(key, null);
  if (storedValue === null
    || typeof storedValue !== 'object'
    || Array.isArray(storedValue)) {
    return fallback;
  }

  const safeRecord = Object.create(null);
  Object.keys(storedValue).forEach((recordKey) => {
    if (!['__proto__', 'constructor', 'prototype'].includes(recordKey)) {
      safeRecord[recordKey] = storedValue[recordKey];
    }
  });
  return safeRecord;
};

/** Reject wallet names that can collide with SDK storage object properties. */
const isSafeWalletName = (walletName) => (
  typeof walletName === 'string'
  && walletName.length > 0
  && walletName.length <= 512
  && !RESERVED_WALLET_NAMES.has(walletName)
);

/**
 * Shuffle an array in place with the Fisher-Yates algorithm.
 *
 * @param {Array} array The array to shuffle.
 * @returns {Array} The same array instance, in randomized order.
 */
const arrayShuffle = (array) => {
  let currentIndex = array.length;

  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
};

/**
 * Submit receive blocks for all pending account blocks for the active address.
 * The timeout prevents a stalled node from keeping the dashboard loading forever.
 *
 * @param {object} zenon Initialized Zenon SDK instance.
 * @param {object} currentKeyPair Key pair used to sign receive blocks.
 * @returns {Promise<void>} Resolves when no pending blocks remain.
 */
const receiveAllBlocks = async (zenon, currentKeyPair) => {
  const address = (await currentKeyPair.getAddress()).toString();
  const addressObject = Primitives.Address.parse(address);
  const timeout = 900000;
  let timeoutId;

  const receivePendingBlocks = async () => {
    let pendingBlocks = await zenon.ledger.getUnreceivedBlocksByAddress(
      addressObject,
      0,
      memoryPoolPageSize,
    );

    while (pendingBlocks.count > 0) {
      for (const block of pendingBlocks.list || []) {
        if (!(await isWalletSessionActive())) {
          return;
        }

        const accountBlock = Primitives.AccountBlockTemplate.receive(block.hash);
        await zenon.send(accountBlock, currentKeyPair);
      }

      pendingBlocks = await zenon.ledger.getUnreceivedBlocksByAddress(
        addressObject,
        0,
        memoryPoolPageSize,
      );
    }
  };

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeout / 1000} seconds`));
    }, timeout);
  });

  try {
    await Promise.race([receivePendingBlocks(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/** Return the names of encrypted wallets known to the SDK key-store manager. */
const loadStorageWalletNames = () => {
  try {
    const _keyManager = new KeyStoreManager();
    const addresses = _keyManager.listAllKeyStores();

    if (addresses === null || typeof addresses !== 'object') {
      return [];
    }

    return Object.keys(addresses).filter((walletName) => (
      isSafeWalletName(walletName)
    ));
  } catch {
    return [];
  }
}

const defaultSelectedAddressIndex = 0;
const defaultMaxAddressIndex = 1;

/**
 * Load the selected address and address-count metadata for a wallet.
 * A selected index of zero is valid and must not reset a wallet's metadata.
 */
const loadStorageAddressInfo = (walletName) => {
  const defaultAddressInfo = {
    selectedAddressIndex: defaultSelectedAddressIndex,
    maxAddressIndex: defaultMaxAddressIndex
  };
  const addressInfo = readStoredRecord("addressInfo", null);

  if(addressInfo){
    const walletAddressInfo = addressInfo[walletName];
    if(walletName && (!walletAddressInfo ||
      !Number.isSafeInteger(walletAddressInfo.maxAddressIndex) ||
      walletAddressInfo.maxAddressIndex <= 0 ||
      walletAddressInfo.maxAddressIndex > MAX_ADDRESS_INDEX ||
      !Number.isSafeInteger(walletAddressInfo.selectedAddressIndex) ||
      walletAddressInfo.selectedAddressIndex < 0 ||
      walletAddressInfo.selectedAddressIndex >= walletAddressInfo.maxAddressIndex)){
      addressInfo[walletName] = defaultAddressInfo;
    }
    setAddressInfoToStorage(addressInfo)
    return addressInfo[walletName];
  }else{
    const initialAddressInfo = walletName ? {[walletName]: defaultAddressInfo} : {};
    setAddressInfoToStorage(initialAddressInfo);
    return initialAddressInfo[walletName];
  }
}

/** Persist wallet address metadata in the extension's local storage. */
const setAddressInfoToStorage = (addressInfo) => {
  localStorage.setItem("addressInfo", JSON.stringify(addressInfo));
}

export {
  arrayShuffle,
  receiveAllBlocks,
  loadStorageWalletNames,
  loadStorageAddressInfo,
  setAddressInfoToStorage,
  readStoredArray,
  readStoredRecord,
  isSafeWalletName,
  MAX_ADDRESS_INDEX,
  defaultSelectedAddressIndex,
  defaultMaxAddressIndex,
};
