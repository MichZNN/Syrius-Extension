import { createSlice } from "@reduxjs/toolkit";
import {loadStorageAddressInfo} from "./../utils/utils";

const initialState = {
  walletName: "",
  selectedAddressIndex: 0,
  maxAddressIndex: 1
}

export const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers:{
    resetWalletState: () => initialState,
    storeWalletName: (state, action) => {
      state.walletName = action.payload;
    },
    loadAddressInfoForWalletFromStorage: (state, action)=>{
      const addressInfo = loadStorageAddressInfo(action.payload);
      if(addressInfo){
        state.selectedAddressIndex = addressInfo.selectedAddressIndex;
        state.maxAddressIndex = addressInfo.maxAddressIndex;
      }
      return state;
    },
    storeSelectedAddressIndex: (state, action) => {
      state.selectedAddressIndex = action.payload;
    },
    storeMaxAddressIndex: (state, action) => {
      state.maxAddressIndex = action.payload;
    },
  },
})

export const { resetWalletState, storeWalletName, storeSelectedAddressIndex, storeMaxAddressIndex, loadAddressInfoForWalletFromStorage } = walletSlice.actions;

export default walletSlice.reducer
