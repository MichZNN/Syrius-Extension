import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Zenon } from 'znn-ts-sdk';

import AlertModal from '../../components/modals/alert-modal';
import PillarItem from '../../components/pillar-item/pillar-item';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import useAccount from '../../services/hooks/useAccount';
import useChainChange from '../../services/hooks/useChainChange';
import usePillarEconomy from '../../services/hooks/usePillarEconomy';
import { delegatorApr, formatApr } from '../../services/pillar/apr';
import { sortChoices, sortPillars } from '../../services/pillar/sort';
import vault from '../../services/wallet/vault';
import { formatAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';

// Delegation.
//
// The uncollected rewards were divided by the wrong token's decimals — the ZNN
// amount by QSR's and the QSR amount by ZNN's. Both happen to be 8 today, so
// nothing was visibly wrong, but the two lines were one differing token away
// from showing numbers off by orders of magnitude.

// The weight a delegation carries, in base units: the address's ZNN, as the
// node reports it. The SDK's `weightWithDecimals` is that figure already
// divided out ("10000.0"), which is not a whole number of anything and read
// as 0 here.
const delegatedWeight = (delegation) => delegation?.weight?.toString() || '0';

const Delegate = () => {
  const { address } = useAccount({ balances: false });
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const { pillars, totals, epoch, error } = usePillarEconomy();
  // The order is the user's last choice, kept for the session only.
  const [order, setOrder] = useState(() => sessionStorage.getItem('syrius.pillarOrder') || 'weight');
  const chooseOrder = (key) => {
    setOrder(key);
    try { sessionStorage.setItem('syrius.pillarOrder', key); } catch (err) { /* not kept */ }
  };
  const sorted = useMemo(
    () => sortPillars(pillars, order, { totals, epoch }),
    [pillars, order, totals, epoch]
  );

  const [delegated, setDelegated] = useState(null);
  const [rewards, setRewards] = useState({ znn: 0, qsr: 0 });

  const loadDelegation = useCallback(async (object) => {
    const zenon = Zenon.getSingleton();

    try {
      const [pillar, uncollected] = await Promise.all([
        zenon.embedded.pillar.getDelegatedPillar(object),
        zenon.embedded.pillar.getUncollectedReward(object),
      ]);
      setDelegated(pillar && pillar.name ? pillar : null);
      setRewards({ znn: uncollected?.znnAmount ?? 0, qsr: uncollected?.qsrAmount ?? 0 });
    } catch (err) {
      // The header already reports a node that cannot be reached.
    }
  }, []);

  // A delegation or a collect confirms while this screen is open.
  useChainChange(() => {
    vault.getAddressObject().then(loadDelegation).catch(() => {});
  });

  useEffect(() => {
    let cancelled = false;

    vault
      .getAddressObject()
      .then((object) => {
        if (cancelled) {
          return;
        }
        loadDelegation(object);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [loadDelegation]);

  // Builds the block and hands it to the background sender. Nothing here
  // waits on proof of work; the line under the header reports it instead.
  const runInBackground = async (buildTemplate, label, successMessage) => {
    try {
      sendInBackground(await buildTemplate(), {
        successMessage,
        row: { owner: address, label },
      });
    } catch (err) {
      notify.error(err);
    }
  };

  const delegate = (name) =>
    openModal(
      <AlertModal
        type="confirm"
        title="Delegate"
        confirmLabel="Delegate"
        onSuccess={() =>
          runInBackground(
            () => Zenon.getSingleton().embedded.pillar.delegate(name),
            `Delegating to ${name}`,
            `Delegated to ${name}`
          )
        }
      >
        <p>
          Delegate your weight to <b>{name}</b>? Your ZNN stays in your wallet and can be
          undelegated at any time.
        </p>
      </AlertModal>
    );

  const undelegate = () =>
    openModal(
      <AlertModal
        type="warning"
        title="Undelegate"
        confirmLabel="Undelegate"
        onSuccess={() =>
          runInBackground(
            () => Zenon.getSingleton().embedded.pillar.undelegate(),
            'Undelegating',
            'Undelegated'
          )
        }
      >
        <p>Stop delegating to {delegated?.name}? You stop earning delegation rewards.</p>
      </AlertModal>
    );

  const collect = () =>
    runInBackground(
      () => Zenon.getSingleton().embedded.pillar.collectReward(),
      'Collecting rewards',
      'Rewards collected'
    );

  const hasRewards =
    formatAmount(rewards.znn, 8) !== '0' || formatAmount(rewards.qsr, 8) !== '0';

  return (
    <div className="page">
      {delegated && (
        <div className="stat-row">
          <div>
            <div className="stat-value">{delegated.name}</div>
            <div className="stat-label">
              Delegated · {formatAmount(delegatedWeight(delegated), 8, { maxDecimals: 0 })} ZNN
            </div>
          </div>
          <button type="button" className="thin-button secondary" onClick={undelegate}>
            Undelegate
          </button>
        </div>
      )}

      {hasRewards && (
        <div className="stat-row">
          <div>
            <div className="stat-value">
              {formatAmount(rewards.znn, 8)} ZNN · {formatAmount(rewards.qsr, 8)} QSR
            </div>
            <div className="stat-label">Uncollected rewards</div>
          </div>
          <button
            type="button"
            className="thin-button primary"
            onClick={collect}
          >
            Collect
          </button>
        </div>
      )}

      {/* Sorting needs every pillar, so the list is read whole (about a
          hundred) rather than paged. */}
      <div className="sort-row" role="group" aria-label="Sort by">
        {sortChoices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={`sort-chip ${order === choice.key ? 'is-selected' : ''}`}
            aria-pressed={order === choice.key}
            onClick={() => chooseOrder(choice.key)}
          >
            {choice.label}
          </button>
        ))}
      </div>

      <div className="list">
        {sorted.map((pillar) => (
          <PillarItem
            key={pillar.name}
            name={pillar.name}
            giveDelegateRewardPercentage={pillar.giveDelegateRewardPercentage}
            weight={pillar.weight}
            producedMomentums={pillar.currentStats?.producedMomentums}
            expectedMomentums={pillar.currentStats?.expectedMomentums}
            producerAddress={pillar.producerAddress?.toString() || ''}
            isDelegatedPillar={pillar.name === delegated?.name}
            apr={formatApr(delegatorApr(pillar, totals, epoch))}
            onDelegate={delegate}
            onUndelegate={undelegate}
          />
        ))}

        {pillars && !pillars.length && <p className="empty-note">None yet</p>}
        {!pillars && !error && <p className="empty-note">Loading…</p>}
        {!pillars && error && <p className="empty-note">Could not load</p>}
      </div>
    </div>
  );
};

export default Delegate;
