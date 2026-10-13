import React, { useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import AlertModal from '../../components/modals/alert-modal';
import PasswordModal from '../../components/modals/password-modal';
import { Address, Amount, Stat, Status } from '../../components/data/data';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import usePillar from '../../services/hooks/usePillar';
import usePillarEconomy from '../../services/hooks/usePillarEconomy';
import { delegatorApr, formatApr } from '../../services/pillar/apr';
import { templates } from '../../services/pillar/calls';
import { advance, steps } from '../../services/pillar/revokeGuard';
import {
  decimals,
  formatDuration,
  pillarStakeZnn,
  productionPercent,
  registrationShortfall,
  revokeWindow,
  toBase,
} from '../../services/pillar/rules';
import { znnZts, qsrZts } from '../../services/wallet/account';
import { formatExact, parseAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';
import EpochHistory from './epoch-history';
import usePopupState from '../../services/utils/popupState';

// The Pillar tab (pillar mode).
//
// One of two screens, by what the selected address is to the pillar contract:
// the pillar it owns, with what an operator checks and the two things they can
// do to it; or what registering one still needs. A pillar's QSR is deposited
// first and burned by the registration, so the deposit lives here, where its
// shortfall is shown, rather than on a screen of its own.

const Owned = ({ pillar, onRevoke }) => {
  const navigate = useNavigate();
  const produced = productionPercent(pillar.currentStats);
  const { revocable, seconds } = revokeWindow(pillar);
  const { totals, epoch } = usePillarEconomy();
  const apr = formatApr(delegatorApr(pillar, totals, epoch));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h1 className="pillar-title">{pillar.name}</h1>
          {produced === null && <Status kind="neutral">Idle</Status>}
          {produced !== null && produced >= 80 && <Status kind="success">Producing</Status>}
          {produced !== null && produced < 80 && <Status kind="warning">Missing momentums</Status>}
        </div>

        <div className="stat-grid">
          <Stat label="Rank">{Number(pillar.rank) + 1}</Stat>
          <Stat label="Weight">
            <Amount value={pillar.weight} decimals={decimals} symbol="ZNN" maxDecimals={0} />
          </Stat>
          <Stat label="Produced">
            {pillar.currentStats?.producedMomentums ?? 0} / {pillar.currentStats?.expectedMomentums ?? 0}
            {produced !== null && <span className="data-amount-symbol">{produced}%</span>}
          </Stat>
        </div>
      </section>

      <dl className="detail-list">
        <dt>Producer</dt>
        <dd><Address value={pillar.producerAddress} label="Producer address" /></dd>
        <dt>Rewards to</dt>
        <dd><Address value={pillar.withdrawAddress} label="Reward address" /></dd>
        <dt>Momentum rewards shared</dt>
        <dd className="mono">{pillar.giveMomentumRewardPercentage}%</dd>
        <dt>Delegation rewards shared</dt>
        <dd className="mono">{pillar.giveDelegateRewardPercentage}%</dd>
        <dt>Delegator APR</dt>
        <dd className="mono">{apr || 'None yet'}</dd>
        <dt>Revoke</dt>
        <dd>
          {revocable
            ? <Status kind="warning">Open for {formatDuration(seconds)}</Status>
            : <Status kind="neutral">Opens in {formatDuration(seconds)}</Status>}
        </dd>
      </dl>

      <EpochHistory name={pillar.name} />

      <div className="action-row sticky-actions">
        <button type="button" className="button danger-text w-100" disabled={!revocable} onClick={onRevoke}>
          Revoke
        </button>
        <button
          type="button"
          className="button primary w-100"
          onClick={() => navigate('update', { state: { pillar } })}
        >
          Update
        </button>
      </div>
    </>
  );
};

const Unregistered = ({ znnBalance, qsrBalance, qsrCost, qsrDeposited, onDeposit, onWithdraw }) => {
  const navigate = useNavigate();
  const { znnShort, qsrShort, ready } = registrationShortfall({ znnBalance, qsrDeposited, qsrCost });
  const [amount, setAmount] = usePopupState('pillar.amount', '');

  const parsed = parseAmount(amount, decimals);
  const tooMuch = parsed !== null && parsed.gt(toBase(qsrBalance).toString());
  const canDeposit = parsed !== null && !parsed.isZero() && !tooMuch;

  return (
    <>
      <section className="card">
        <h1 className="pillar-title">Register a pillar</h1>
        <dl className="detail-list is-flush">
          <dt>ZNN stake</dt>
          <dd>
            <Amount value={pillarStakeZnn} decimals={decimals} symbol="ZNN" maxDecimals={0} />
            {znnShort > 0n
              ? <Status kind="warning">Short</Status>
              : <Status kind="success">Held</Status>}
          </dd>
          <dt>QSR burned</dt>
          <dd>
            <Amount value={qsrCost} decimals={decimals} symbol="QSR" maxDecimals={0} />
            {qsrShort > 0n
              ? <Status kind="warning">Short</Status>
              : <Status kind="success">Deposited</Status>}
          </dd>
          <dt>QSR deposited</dt>
          <dd><Amount value={qsrDeposited} decimals={decimals} symbol="QSR" /></dd>
        </dl>
      </section>

      <h3 className="section-title">Deposit QSR</h3>
      <div className="input-with-button">
        <input
          className={`custom-label mono ${tooMuch ? 'custom-label-error' : ''}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label="QSR to deposit"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {qsrShort > 0n && (
          <button
            type="button"
            className="input-chip-button"
            onClick={() => setAmount(formatExact(qsrShort.toString(), decimals))}
          >
            Fill
          </button>
        )}
      </div>
      {tooMuch && <div className="input-error">More QSR than this address holds.</div>}

      <div className="action-row">
        <button
          type="button"
          className="button secondary w-100"
          disabled={toBase(qsrDeposited) === 0n}
          onClick={onWithdraw}
        >
          Withdraw
        </button>
        <button
          type="button"
          className="button secondary w-100"
          disabled={!canDeposit}
          onClick={() => { onDeposit(parsed); setAmount(''); }}
        >
          Deposit
        </button>
      </div>

      <div className="sticky-actions">
        <button
          type="button"
          className="button primary w-100"
          disabled={!ready}
          onClick={() => navigate('register')}
        >
          Register
        </button>
      </div>
    </>
  );
};

const Pillar = () => {
  const { address, balanceMap, pillar, qsrCost, qsrDeposited, isLoading, error, refresh } = usePillar();
  const { sendInBackground } = useBackgroundSender();
  const { openModal, closeModal } = useContext(ModalContext);

  // Sent in the background like every block the wallet's own screens send:
  // the dashboard shows it in flight and reports the outcome.
  const send = (build, label, successMessage, row = {}) => {
    try {
      sendInBackground(build(), { successMessage, row: { owner: address, label, ...row } });
      return true;
    } catch (err) {
      notify.error(err);
      return false;
    }
  };

  // Revoke ends the pillar, so the button sends nothing: it asks for the
  // wallet password again, then asks once more. The order is
  // services/pillar/revokeGuard.js; the step lives in a ref because both
  // dialogs outlive the render that opened them.
  const revokeStep = useRef(steps.idle);
  const step = (event, extra) => {
    revokeStep.current = advance(revokeStep.current, event, { pillar, ...extra });
    return revokeStep.current;
  };

  const revoke = () => {
    revokeStep.current = steps.idle;
    if (step('press') !== steps.password) return;

    openModal(
      <PasswordModal
        title={`Revoke ${pillar.name}`}
        onDismiss={() => step('cancel')}
        onVerified={() => {
          if (step('password', { verified: true }) !== steps.confirm) {
            closeModal();
            return;
          }
          openModal(
            <AlertModal
              type="danger"
              title={`Revoke ${pillar.name}`}
              confirmLabel="Revoke"
              onDismiss={() => step('cancel')}
              onSuccess={() => {
                if (step('confirmed') !== steps.send) return;
                send(() => templates.revoke(pillar.name), `Revoking ${pillar.name}`, 'Pillar revoked');
              }}
            >
              <p>This ends <b>{pillar.name}</b>. It cannot be undone.</p>
            </AlertModal>
          );
        }}
      >
        <p>
          <b>{pillar.name}</b> stops producing and its 15,000 ZNN returns to this address. The QSR
          burned to register it does not.
        </p>
      </PasswordModal>
    );
  };

  const deposit = (amount) => {
    const sent = send(
      () => templates.depositQsr(amount),
      'Depositing QSR',
      'QSR deposited',
      { amount: amount.toString(), decimals, tokenSymbol: 'QSR' }
    );
    if (sent) setTimeout(refresh, 12000);
  };

  const withdraw = () => {
    if (send(() => templates.withdrawQsr(), 'Withdrawing QSR', 'QSR withdrawn')) {
      setTimeout(refresh, 12000);
    }
  };

  if (isLoading) {
    return <div className="page"><p className="empty-note">Loading…</p></div>;
  }

  return (
    <div className="page">
      {error && <p className="notice is-warning">The node did not answer. These figures may be old.</p>}

      {pillar ? (
        <Owned pillar={pillar} onRevoke={revoke} />
      ) : (
        <Unregistered
          znnBalance={balanceMap[znnZts]?.balance}
          qsrBalance={balanceMap[qsrZts]?.balance}
          qsrCost={qsrCost}
          qsrDeposited={qsrDeposited}
          onDeposit={deposit}
          onWithdraw={withdraw}
        />
      )}
    </div>
  );
};

export default Pillar;
