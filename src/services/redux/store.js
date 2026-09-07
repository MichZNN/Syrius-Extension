import { configureStore } from '@reduxjs/toolkit';
import walletReducer from './walletSlice';
import connectionParametersReducer from './connectionParametersSlice';
import pendingTransactionsReducer from './pendingTransactionsSlice';

// The dApp approval flow used to have a slice of its own holding a
// hand-rolled state machine of "flows" and "steps". It is gone: an approval is
// one pending request read from the service worker by the screen that shows it,
// and a screen's own state is not application state.
export const store = configureStore({
  reducer: {
    wallet: walletReducer,
    connectionParameters: connectionParametersReducer,
    pendingTransactions: pendingTransactionsReducer,
  },
});
