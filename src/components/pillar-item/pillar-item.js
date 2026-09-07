import React from 'react';

import { formatAmount } from '../../services/utils/format';

// One pillar in the delegation list.
//
// It played a Lottie animation per row — every row mounting its own player,
// with the 611 KiB `lottie-web` runtime behind it — and printed seven labelled
// lines of statistics in 10px text, most of which do not bear on the one
// decision this screen exists for. What is left is what a delegator chooses on:
// the pillar's weight, what it pays out, and whether it is producing the
// momentums it is expected to.

const PillarItem = ({
  name,
  giveDelegateRewardPercentage,
  weight,
  producedMomentums,
  expectedMomentums,
  producerAddress,
  isDelegatedPillar,
  onDelegate,
  onUndelegate,
}) => {
  const expected = Number(expectedMomentums) || 0;
  const produced = Number(producedMomentums) || 0;
  // A pillar that has not been asked to produce anything this epoch is not
  // failing to; showing it as 0% would be a lie.
  const performance = expected > 0 ? Math.round((produced / expected) * 100) : null;
  const isUnderperforming = performance !== null && performance < 80;

  return (
    <div className={`pillar-row ${isDelegatedPillar ? 'is-delegated' : ''}`}>
      <div className="pillar-body">
        <div className="pillar-name" title={`Producer ${producerAddress}`}>
          {name}
        </div>
        <div className="pillar-stats">
          <span>{formatAmount(weight, 8, { maxDecimals: 0 })} weight</span>
          <span>{giveDelegateRewardPercentage}% to delegators</span>
          {performance !== null && (
            <span className={isUnderperforming ? 'is-warning' : ''}>{performance}% produced</span>
          )}
        </div>
      </div>

      <button
        type="button"
        className="thin-button secondary"
        onClick={() => (isDelegatedPillar ? onUndelegate() : onDelegate(name))}
      >
        {isDelegatedPillar ? 'Undelegate' : 'Delegate'}
      </button>
    </div>
  );
};

export default PillarItem;
