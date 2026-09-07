import { KeyStoreManager } from 'znn-ts-sdk';
import { forgetAddressInfo } from './storage';

// `receiveAllBlocks` moved to services/wallet/account.js, where it is bounded
// and reports progress. The address bookkeeping moved to services/utils/storage.js,
// which validates what it reads back. What is left here is the small stuff that
// belongs to no particular screen.

const arrayShuffle = (array) => {
  const result = [...array];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

const loadStorageWalletNames = () => {
  try {
    return Object.keys(new KeyStoreManager().listAllKeyStores() || {});
  } catch (err) {
    return [];
  }
};

// Removing a wallet.
//
// The SDK's KeyStoreManager can create and read key stores but has no way to
// delete one, so this reaches the storage key it owns directly rather than
// leaving people with no way to get a wallet off a shared machine. Desktop
// Syrius has had this since the beginning.
const walletStorageKey = 'znn.ts-wallet';

const removeStorageWallet = (walletName) => {
  try {
    const wallets = JSON.parse(localStorage.getItem(walletStorageKey) || '{}');

    if (!wallets[walletName]) {
      return false;
    }
    delete wallets[walletName];
    localStorage.setItem(walletStorageKey, JSON.stringify(wallets));
    forgetAddressInfo(walletName);
    return true;
  } catch (err) {
    return false;
  }
};

export { arrayShuffle, loadStorageWalletNames, removeStorageWallet, walletStorageKey };
