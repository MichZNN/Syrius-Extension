import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  persistBalancesVisible,
  toggleBalancesVisible,
} from '../../services/redux/balanceVisibilitySlice';

/** Toggle the local balance display preference from the wallet dashboard. */
const BalanceVisibilityToggle = () => {
  const dispatch = useDispatch();
  const balancesVisible = useSelector((state) => state.balanceVisibility.balancesVisible);

  const handleToggle = () => {
    persistBalancesVisible(!balancesVisible);
    dispatch(toggleBalancesVisible());
  };

  return (
    <button
      aria-label={balancesVisible ? 'Hide balance' : 'Show balance'}
      aria-pressed={!balancesVisible}
      className="balance-visibility-toggle"
      onClick={handleToggle}
      title={balancesVisible ? 'Hide balance' : 'Show balance'}
      type="button"
    >
      {balancesVisible ? (
        <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="12" cy="12" fill="currentColor" r="2.5" />
        </svg>
      ) : (
        <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3l18 18M10.6 6.2C11.1 6.1 11.5 6 12 6c6.5 0 10 6 10 6a17.7 17.7 0 0 1-3.1 3.8M6.1 6.9C3.5 8.5 2 12 2 12s3.5 6 10 6c1 0 2-.1 2.8-.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
};

export default BalanceVisibilityToggle;
