import { createSlice } from "@reduxjs/toolkit";

/**
 * Stores the local display preference for wallet balances. This preference is
 * cosmetic only; transaction amounts remain visible for confirmation.
 */
export const BALANCE_VISIBILITY_STORAGE_KEY = "balancesVisible";

const readInitialVisibility = () => {
  try {
    return localStorage.getItem(BALANCE_VISIBILITY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

const initialState = {
  balancesVisible: readInitialVisibility(),
};

export const balanceVisibilitySlice = createSlice({
  name: "balanceVisibility",
  initialState,
  reducers: {
    toggleBalancesVisible: (state) => {
      state.balancesVisible = !state.balancesVisible;
    },
  },
});

export const { toggleBalancesVisible } = balanceVisibilitySlice.actions;

export const persistBalancesVisible = (isVisible) => {
  try {
    localStorage.setItem(BALANCE_VISIBILITY_STORAGE_KEY, String(isVisible));
  } catch {
    // A storage failure should not prevent the current popup from toggling.
  }
};

export default balanceVisibilitySlice.reducer;
