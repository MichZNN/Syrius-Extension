import React from 'react';

import { isCancellable } from '../../services/plasma/batchCancel';
import { formatAmount, momentumsToDuration, truncateAddress } from '../../services/utils/format';

// One plasma fusion.
//
// The expiry used to be computed by the page as
// `(expirationHeight - momentumHeight) * 10 / 3600` and rendered as
// "3.47 h" — hours to two decimal places, which nobody reads. It also divided
// by a hard-coded 1e8 rather than the token's decimals.
const FuseItem = ({
  id,
  amount,
  decimals,
  beneficiary,
  expirationHeight,
  momentumHeight,
  isRevocable = true,
  cancelFuse,
  // Set when fuses can be picked for a batch (services/plasma/batchCancel.js).
  onSelect,
  selected = false,
}) => {
  const remaining = Number(expirationHeight) - Number(momentumHeight);
  const isUnlocked = !momentumHeight || remaining <= 0;
  const canCancel = isCancellable({ expirationHeight, isRevocable }, momentumHeight);

  return (
    <div className={`list-row ${selected ? 'is-selected' : ''}`}>
      {onSelect && canCancel && (
        <label className="row-check">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select the fuse of ${formatAmount(amount, decimals)} QSR`}
            onChange={() => onSelect(id)}
          />
        </label>
      )}
      <div className="list-row-main">
        <div className="list-row-title">{formatAmount(amount, decimals)} QSR</div>
        <div className="list-row-note" title={beneficiary}>
          For {truncateAddress(beneficiary)}
        </div>
      </div>

      {canCancel ? (
        <button type="button" className="thin-button secondary" onClick={() => cancelFuse(id)}>
          Cancel
        </button>
      ) : isUnlocked ? (
        <div className="list-row-side">
          <div className="list-row-note">Active</div>
          <div className="list-row-value">Provided externally</div>
        </div>
      ) : (
        <div className="list-row-side">
          <div className="list-row-note">Unlocks in</div>
          <div className="list-row-value">{momentumsToDuration(remaining)}</div>
        </div>
      )}
    </div>
  );
};

export default FuseItem;
