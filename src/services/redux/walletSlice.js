import { createSlice } from '@reduxjs/toolkit';
import { getAddressInfo } from '../utils/storage';

// What the UI needs to know about the open wallet.
//
// `walletPassword` used to be in here. It was put in the store so that any
// screen could re-open the keystore for itself, which is the habit that made
// every navigation cost an Argon2id run — and it meant the password sat in
// application state, reachable from the Redux devtools and from any component
// that called `useSelector`. Screens ask `services/wallet/vault` for a key pair
// now, and nothing outside that module ever sees key material.

const initialState = {
  walletName: '',
  isUnlocked: false,
  selectedAddressIndex: 0,
  maxAddressIndex: 1,
  // The selected address in string form. Deriving it is asynchronous, so it is
  // resolved once at unlock and kept here rather than re-derived per screen.
  address: '',
};

export const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    // Reducers must return the next state, not reassign the local parameter.
    // The old `resetWalletState` did `state = initialState`, which rebinds a
    // function argument and leaves the store exactly as it was — so locking
    // the wallet never actually cleared anything from it.
    resetWalletState: () => initialState,

    walletUnlocked: (state, action) => {
      const { walletName, address, selectedAddressIndex, maxAddressIndex } = action.payload;
      state.walletName = walletName;
      state.address = address;
      state.isUnlocked = true;
      state.selectedAddressIndex = selectedAddressIndex;
      state.maxAddressIndex = maxAddressIndex;
    },

    storeWalletName: (state, action) => {
      state.walletName = action.payload;
    },

    loadAddressInfoForWalletFromStorage: (state, action) => {
      const addressInfo = getAddressInfo(action.payload);
      state.selectedAddressIndex = addressInfo.selectedAddressIndex;
      state.maxAddressIndex = addressInfo.maxAddressIndex;
    },

    storeSelectedAddress: (state, action) => {
      state.selectedAddressIndex = action.payload.index;
      state.address = action.payload.address;
    },

    storeMaxAddressIndex: (state, action) => {
      state.maxAddressIndex = action.payload;
    },
  },
});

export const {
  resetWalletState,
  walletUnlocked,
  storeWalletName,
  storeSelectedAddress,
  storeMaxAddressIndex,
  loadAddressInfoForWalletFromStorage,
} = walletSlice.actions;

export default walletSlice.reducer;
