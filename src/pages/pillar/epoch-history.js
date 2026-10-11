import React, { useCallback } from 'react';

import { Amount } from '../../components/data/data';
import usePagedList from '../../services/hooks/usePagedList';
import { reads } from '../../services/pillar/calls';
import { decimals, epochProduction } from '../../services/pillar/rules';

// A pillar's past epochs, newest first: what it was asked to produce, what it
// produced, and the weight it carried. An epoch is a day. The bar behind each
// row is the share produced, so a bad day stands out without reading a figure.

const EpochHistory = ({ name }) => {
  const fetchPage = useCallback((page, pageSize) => reads.epochHistory(name, page, pageSize), [name]);
  const history = usePagedList(fetchPage, { pageSize: 15, enabled: Boolean(name) });

  return (
    <>
      <h3 className="section-title">By epoch</h3>

      <div className="table">
        {history.items.length > 0 && (
          <div className="table-row table-head">
            <span>Epoch</span>
            <span>Produced</span>
            <span>Weight</span>
          </div>
        )}
        {history.items.map((entry) => {
          const percent = epochProduction(entry);
          return (
            <div
              className={`table-row has-bar ${percent !== null && percent < 80 ? 'is-low' : ''}`}
              key={entry.epoch}
              style={{ '--share': `${percent ?? 0}%` }}
            >
              <span className="mono">{entry.epoch}</span>
              <span className="mono">
                {entry.producedBlockNum} / {entry.expectedBlockNum}
                {percent !== null && <span className="data-amount-symbol">{percent}%</span>}
              </span>
              <Amount value={entry.weight} decimals={decimals} maxDecimals={0} />
            </div>
          );
        })}

        {!history.items.length && !history.hasMore && <p className="empty-note">None yet</p>}
        {history.error && !history.items.length && <p className="empty-note">Could not load</p>}

        <div ref={history.sentinelRef} className="load-more-sentinel">
          {history.showLoading && <span className="text-gray">Loading…</span>}
        </div>
      </div>
    </>
  );
};

export default EpochHistory;
