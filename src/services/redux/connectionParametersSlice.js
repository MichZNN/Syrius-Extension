import { createSlice } from "@reduxjs/toolkit";
import {
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_MAINNET_NODE_URL,
} from '../utils/networkDefaults';

const initialState = {
  nodeUrl: DEFAULT_MAINNET_NODE_URL,
  chainIdentifier: DEFAULT_MAINNET_CHAIN_ID
}

export const connectionParametersSlice = createSlice({
  name: "wallet",
  initialState,
  reducers:{
    resetConnectionParametersState: () => initialState,
    storeNodeUrl: (state, action) => {
      state.nodeUrl = action.payload;
    },
    storeChainIdentifier: (state, action) => {
      state.chainIdentifier = action.payload;
    },
  },
})

export const { resetConnectionParametersState, storeNodeUrl, storeChainIdentifier } = connectionParametersSlice.actions;

export default connectionParametersSlice.reducer
