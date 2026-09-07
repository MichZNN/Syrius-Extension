/**
 * Keep the decrypted keystore in the trusted extension page only.
 *
 * The password is deliberately not part of Redux or chrome.storage.session.
 * Unlocking with a password happens once, while reopening the popup restores
 * the keystore from temporary session entropy. The browser clears that session
 * storage when the browser session ends or the background worker locks it.
 */
import { KeyStore, KeyStoreManager, Primitives } from 'znn-ts-sdk';
import { isValidSessionEntropy } from './sessionEntropy';

const state = {
  walletName: null,
  keyStore: null,
  selectedAddressIndex: 0,
  keyPairs: new Map(),
  addresses: new Map(),
  signingKeyPairs: new Map(),
};

const clear = () => {
  state.walletName = null;
  state.keyStore = null;
  state.selectedAddressIndex = 0;
  state.keyPairs.clear();
  state.addresses.clear();
  state.signingKeyPairs.clear();
};

const adopt = (walletName, keyStore) => {
  clear();
  state.walletName = walletName;
  state.keyStore = keyStore;
  return keyStore;
};

const unlockWithPassword = async (walletName, password) => {
  const keyStore = await new KeyStoreManager().readKeyStore(password, walletName);

  if (!keyStore) {
    throw new Error('Unable to unlock wallet');
  }

  return adopt(walletName, keyStore);
};

const unlockWithEntropy = (walletName, entropy) => {
  if (!isValidSessionEntropy(entropy)) {
    throw new Error('Unable to restore wallet session');
  }

  return adopt(walletName, new KeyStore().fromEntropy(entropy));
};

const requireKeyStore = () => {
  if (!state.keyStore) {
    throw new Error('Wallet is locked');
  }

  return state.keyStore;
};

const setSelectedAddressIndex = (index) => {
  if (!Number.isSafeInteger(index) || index < 0) {
    state.selectedAddressIndex = 0;
    return;
  }

  state.selectedAddressIndex = index;
};

const getKeyPair = (index = state.selectedAddressIndex) => {
  const keyStore = requireKeyStore();
  const normalizedIndex = Number.isSafeInteger(index) && index >= 0 ? index : 0;

  if (!state.keyPairs.has(normalizedIndex)) {
    state.keyPairs.set(normalizedIndex, keyStore.getKeyPair(normalizedIndex));
  }

  return state.keyPairs.get(normalizedIndex);
};

const getAddress = async (index = state.selectedAddressIndex) => {
  const normalizedIndex = Number.isSafeInteger(index) && index >= 0 ? index : 0;

  if (!state.addresses.has(normalizedIndex)) {
    const address = (await getKeyPair(normalizedIndex).getAddress()).toString();
    state.addresses.set(normalizedIndex, address);
  }

  return state.addresses.get(normalizedIndex);
};

const getAddressObject = async (index = state.selectedAddressIndex) => (
  Primitives.Address.parse(await getAddress(index))
);

const getAddresses = async (count) => {
  const normalizedCount = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  const addresses = [];

  for (let index = 0; index < normalizedCount; index += 1) {
    addresses.push(await getAddress(index));
  }

  return addresses;
};

const getSigningKeyPair = async (index = state.selectedAddressIndex) => {
  const normalizedIndex = Number.isSafeInteger(index) && index >= 0 ? index : 0;

  if (!state.signingKeyPairs.has(normalizedIndex)) {
    state.signingKeyPairs.set(
      normalizedIndex,
      await getKeyPair(normalizedIndex).generateKeyPair(),
    );
  }

  return state.signingKeyPairs.get(normalizedIndex);
};

/** Verify a re-authentication password without changing the active session. */
const verifyPassword = async (password) => {
  if (!state.walletName || !state.keyStore) {
    return false;
  }

  try {
    const keyStore = await new KeyStoreManager().readKeyStore(password, state.walletName);
    return Boolean(keyStore && keyStore.entropy === state.keyStore.entropy);
  } catch {
    return false;
  }
};

const walletVault = {
  clear,
  isUnlocked: () => state.keyStore !== null,
  getWalletName: () => state.walletName,
  getSelectedAddressIndex: () => state.selectedAddressIndex,
  setSelectedAddressIndex,
  getKeyStore: requireKeyStore,
  getEntropy: () => state.keyStore?.entropy || null,
  getMnemonic: () => state.keyStore?.mnemonic || null,
  unlockWithPassword,
  unlockWithEntropy,
  getKeyPair,
  getSigningKeyPair,
  getAddress,
  getAddressObject,
  getAddresses,
  verifyPassword,
};

export default walletVault;
