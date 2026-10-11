import React, { useCallback, useEffect, useState } from 'react';

import { Amount, Stat } from '../../components/data/data';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import usePriceFeed from '../../services/hooks/usePriceFeed';
import usePagedList from '../../services/hooks/usePagedList';
import useChainChange from '../../services/hooks/useChainChange';
import { reads, templates } from '../../services/pillar/calls';
import { decimals, toBase } from '../../services/pillar/rules';
import { notify } from '../../services/utils/notify';
import { formatUsd } from '../../services/utils/format';

// The Rewards tab (pillar mode): what the pillar contract owes this address,
// and what it has paid, epoch by epoch.
//
// The contract pays a pillar's rewards to its reward address, so this is the
// screen to open on that address. It is the same balance Delegate collects
// from: one contract, one reward account per address.

const Rewards = () => {
  const { address } = useAccount({ balances: false });
  const { sendInBackground } = useBackgroundSender();
  const [uncollected, setUncollected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!address) return undefined;
    reads
      .uncollected(address)
      .then((reward) => { if (!cancelled) setUncollected(reward); })
      // The header already reports a node that cannot be reached.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  const fetchPage = useCallback(
    (page, pageSize) => reads.rewardHistory(address, page, pageSize),
    [address]
  );
  const history = usePagedList(fetchPage, { pageSize: 20, enabled: Boolean(address) });

  useChainChange(() => {
    if (address) reads.uncollected(address).then(setUncollected).catch(() => {});
    history.refresh();
  });

  const znn = toBase(uncollected?.znnAmount);
  const qsr = toBase(uncollected?.qsrAmount);
  // At mainnet's price, whatever chain this is: a sense of scale, not a quote.
  const prices = usePriceFeed(true);
  const usd = prices.znn === null && prices.qsr === null ? null
    : (Number(znn) / 1e8) * (prices.znn || 0) + (Number(qsr) / 1e8) * (prices.qsr || 0);

  const collect = () => {
    try {
      sendInBackground(templates.collect(), {
        successMessage: 'Rewards collected',
        row: { owner: address, label: 'Collecting rewards' },
      });
    } catch (err) {
      notify.error(err);
    }
  };

  // An epoch that paid nothing is not a payment.
  const paid = history.items.filter((entry) => toBase(entry.znnAmount) > 0n || toBase(entry.qsrAmount) > 0n);
  // Each row's ZNN against the largest shown, drawn as a faint bar behind it.
  const most = paid.reduce((max, entry) => Math.max(max, Number(toBase(entry.znnAmount))), 0) || 1;

  return (
    <div className="page">
      <section className="card">
        <div className="stat-grid is-two">
          <Stat label="Uncollected ZNN">
            <Amount value={znn.toString()} decimals={decimals} />
          </Stat>
          <Stat label="Uncollected QSR">
            <Amount value={qsr.toString()} decimals={decimals} />
          </Stat>
        </div>
        {usd !== null && <div className="rewards-usd mono">≈ {formatUsd(usd)}</div>}
        <button
          type="button"
          className="button primary w-100"
          disabled={znn === 0n && qsr === 0n}
          onClick={collect}
        >
          Collect
        </button>
      </section>

      <h3 className="section-title">By epoch</h3>

      <div className="table">
        {paid.length > 0 && (
          <div className="table-row table-head">
            <span>Epoch</span>
            <span>ZNN</span>
            <span>QSR</span>
          </div>
        )}
        {paid.map((entry) => (
          <div
            className="table-row has-bar"
            key={entry.epoch}
            style={{ '--share': `${(Number(toBase(entry.znnAmount)) / most) * 100}%` }}
          >
            <span className="mono">{entry.epoch}</span>
            <Amount value={entry.znnAmount} decimals={decimals} />
            <Amount value={entry.qsrAmount} decimals={decimals} />
          </div>
        ))}

        {!paid.length && !history.hasMore && <p className="empty-note">None yet</p>}
        {history.error && !paid.length && <p className="empty-note">Could not load</p>}

        <div ref={history.sentinelRef} className="load-more-sentinel">
          {history.showLoading && <span className="text-gray">Loading…</span>}
        </div>
      </div>
    </div>
  );
};

export default Rewards;
