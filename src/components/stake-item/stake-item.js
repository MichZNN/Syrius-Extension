import React from 'react';

import { formatAmount } from '../../services/utils/format';

// One stake entry.
const secondsToDuration = (seconds) => {
  if (seconds <= 0) {
    return 'now';
  }
  const hours = seconds / 3600;

  if (hours < 48) {
    return `${Math.round(hours)} h`;
  }
  return `${Math.round(hours / 24)} days`;
};

const StakeItem = ({ id, amount, decimals, startTimestamp, expirationTimestamp, cancelStake }) => {
  const now = Date.now() / 1000;
  const remaining = Number(expirationTimestamp) - now;
  const months = Math.round((Number(expirationTimestamp) - Number(startTimestamp)) / 2592000);
  const isMature = remaining <= 0;

  return (
    <div className="list-row">
      <div className="list-row-main">
        <div className="list-row-title">{formatAmount(amount, decimals)} ZNN</div>
        <div className="list-row-note">
          {months} month{months === 1 ? '' : 's'}
        </div>
      </div>

      {isMature ? (
        <button type="button" className="thin-button secondary" onClick={() => cancelStake(id)}>
          Withdraw
        </button>
      ) : (
        <div className="list-row-side">
          <div className="list-row-note">Unlocks in</div>
          <div className="list-row-value">{secondsToDuration(remaining)}</div>
        </div>
      )}
    </div>
  );
};

export default StakeItem;
