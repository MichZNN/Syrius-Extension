import { configureStore } from "@reduxjs/toolkit";
import walletReducer from "./walletSlice"
import integrationFlowReducer from "./integrationSlice"
import connectionParametersReducer from "./connectionParametersSlice";
import balanceVisibilityReducer from "./balanceVisibilitySlice";

export const store = configureStore({
  // Wallet key material stays in the trusted vault module, never in Redux.
  // DevTools are disabled as an additional defence against accidental state
  // exposure while the wallet is open.
  devTools: false,
  reducer:{
    wallet: walletReducer,
    integrationFlow: integrationFlowReducer,
    connectionParameters: connectionParametersReducer,
    balanceVisibility: balanceVisibilityReducer,
  }
})
