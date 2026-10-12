import React, { useContext, useRef } from 'react';

import AlertModal from '../../components/modals/alert-modal';
import PasswordModal from '../../components/modals/password-modal';
import { Amount, Stat, Status } from '../../components/data/data';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import useSentinel from '../../services/hooks/useSentinel';
import { advance, steps } from '../../services/pillar/revokeGuard';
import { formatDuration } from '../../services/pillar/rules';
import {
  revokeWindow,
  sentinelState,
  shortfall,
  stakeQsr,
  stakeZnn,
  templates,
  toBase,
} from '../../services/sentinel/sentinel';
import { znnZts, qsrZts } from '../../services/wallet/account';
import { formatExact, parseAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';
import usePopupState from '../../services/utils/popupState';

// Sentinel (sentinel mode).
//
// One of three screens, by what the selected address is to the sentinel
// contract: its sentinel, with the rewards waiting and the way to revoke it;
// what registering one still needs; or, for an address whose sentinel was
// revoked, what is left to take out. The rules are in
// services/sentinel/sentinel.js.

const decimals = 8;

const Rewards = ({ uncollected, onCollect }) => {
  const znn = toBase(uncollected?.znnAmount);
  const qsr = toBase(uncollected?.qsrAmount);

  return (
    <section className="card">
      <div className="card-head">
        <span className="ledger-label">Rewards</span>
        <button type="button" className="thin-button primary" disabled={znn === 0n && qsr === 0n} onClick={onCollect}>
          Collect
        </button>
      </div>
      <div className="stat-grid">
        <Stat label="ZNN"><Amount value={znn.toString()} decimals={decimals} /></Stat>
        <Stat label="QSR"><Amount value={qsr.toString()} decimals={decimals} /></Stat>
      </div>
    </section>
  );
};

const Owned = ({ sentinel, activeCount, uncollected, onCollect, onRevoke }) => {
  const { revocable, seconds } = revokeWindow(sentinel);

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h1 className="pillar-title">Sentinel</h1>
          <Status kind="success">Active</Status>
        </div>
        <div className="stat-grid">
          <Stat label="ZNN"><Amount value={stakeZnn.toString()} decimals={decimals} maxDecimals={0} /></Stat>
          <Stat label="QSR"><Amount value={stakeQsr.toString()} decimals={decimals} maxDecimals={0} /></Stat>
          <Stat label="Active">{activeCount ?? 0}</Stat>
        </div>
      </section>

      <Rewards uncollected={uncollected} onCollect={onCollect} />

      <dl className="detail-list">
        <dt>Registered</dt>
        <dd className="mono">{new Date(Number(sentinel.registrationTimestamp) * 1000).toISOString().slice(0, 10)}</dd>
        <dt>Revoke</dt>
        <dd>
          {revocable
            ? <Status kind="warning">Open for {formatDuration(seconds)}</Status>
            : <Status kind="neutral">Opens in {formatDuration(seconds)}</Status>}
        </dd>
      </dl>

      <div className="sticky-actions">
        <button type="button" className="button danger-text w-100" disabled={!revocable} onClick={onRevoke}>
          Revoke
        </button>
      </div>
    </>
  );
};

// The QSR an address has put in and not yet used: shown wherever there is
// some, with the way to take it back.
const Deposit = ({ qsrBalance, qsrDeposited, qsrShort, canAdd, onDeposit, onWithdraw }) => {
  const [amount, setAmount] = usePopupState('sentinel.amount', '');
  const parsed = parseAmount(amount, decimals);
  const tooMuch = parsed !== null && parsed.gt(toBase(qsrBalance).toString());
  const canDeposit = canAdd && parsed !== null && !parsed.isZero() && !tooMuch;

  return (
    <>
      {canAdd && (
        <>
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
              <button type="button" className="input-chip-button" onClick={() => setAmount(formatExact(qsrShort.toString(), decimals))}>
                Fill
              </button>
            )}
          </div>
          {tooMuch && <div className="input-error">More QSR than this address holds.</div>}
        </>
      )}

      <div className="action-row">
        <button type="button" className="button secondary w-100" disabled={toBase(qsrDeposited) === 0n} onClick={onWithdraw}>
          Withdraw
        </button>
        {canAdd && (
          <button
            type="button"
            className="button secondary w-100"
            disabled={!canDeposit}
            onClick={() => { onDeposit(parsed); setAmount(''); }}
          >
            Deposit
          </button>
        )}
      </div>
    </>
  );
};

const Unregistered = ({ znnBalance, qsrBalance, qsrDeposited, onDeposit, onWithdraw, onRegister }) => {
  const { znnShort, qsrShort, ready } = shortfall({ znnBalance, qsrDeposited });

  return (
    <>
      <section className="card">
        <h1 className="pillar-title">Register a sentinel</h1>
        <dl className="detail-list is-flush">
          <dt>ZNN stake</dt>
          <dd>
            <Amount value={stakeZnn.toString()} decimals={decimals} symbol="ZNN" maxDecimals={0} />
            {znnShort > 0n ? <Status kind="warning">Short</Status> : <Status kind="success">Held</Status>}
          </dd>
          <dt>QSR stake</dt>
          <dd>
            <Amount value={stakeQsr.toString()} decimals={decimals} symbol="QSR" maxDecimals={0} />
            {qsrShort > 0n ? <Status kind="warning">Short</Status> : <Status kind="success">Deposited</Status>}
          </dd>
          <dt>QSR deposited</dt>
          <dd><Amount value={qsrDeposited} decimals={decimals} symbol="QSR" /></dd>
        </dl>
      </section>

      <Deposit
        qsrBalance={qsrBalance}
        qsrDeposited={qsrDeposited}
        qsrShort={qsrShort}
        canAdd
        onDeposit={onDeposit}
        onWithdraw={onWithdraw}
      />

      <div className="sticky-actions">
        <button type="button" className="button primary w-100" disabled={!ready} onClick={onRegister}>
          Register
        </button>
      </div>
    </>
  );
};

const Revoked = ({ qsrDeposited, uncollected, onCollect, onWithdraw }) => (
  <>
    <section className="card">
      <div className="card-head">
        <h1 className="pillar-title">Sentinel</h1>
        <Status kind="neutral">Revoked</Status>
      </div>
      <p className="notice">An address registers a sentinel once. Use another address for a new one.</p>
    </section>

    <Rewards uncollected={uncollected} onCollect={onCollect} />

    {toBase(qsrDeposited) > 0n && (
      <>
        <dl className="detail-list">
          <dt>QSR deposited</dt>
          <dd><Amount value={qsrDeposited} decimals={decimals} symbol="QSR" /></dd>
        </dl>
        <Deposit qsrDeposited={qsrDeposited} qsrShort={0n} canAdd={false} onWithdraw={onWithdraw} />
      </>
    )}
  </>
);

const Sentinel = () => {
  const { address, balanceMap, sentinel, qsrDeposited, uncollected, activeCount, isLoading, error, refresh } = useSentinel();
  const { sendInBackground } = useBackgroundSender();
  const { openModal, closeModal } = useContext(ModalContext);

  const send = (build, label, successMessage, row = {}) => {
    try {
      sendInBackground(build(), { successMessage, row: { owner: address, label, ...row } });
      return true;
    } catch (err) {
      notify.error(err);
      return false;
    }
  };

  // Revoke asks for the wallet password, then once more, in the order
  // services/pillar/revokeGuard.js holds for a pillar: the same table, read
  // against the sentinel's own revoke window.
  const revokeStep = useRef(steps.idle);
  const step = (event, extra) => {
    const subject = revokeWindow(sentinel).revocable ? sentinel : null;
    revokeStep.current = advance(revokeStep.current, event, { pillar: subject, ...extra });
    return revokeStep.current;
  };

  const revoke = () => {
    revokeStep.current = steps.idle;
    if (step('press') !== steps.password) return;

    openModal(
      <PasswordModal
        title="Revoke sentinel"
        onDismiss={() => step('cancel')}
        onVerified={() => {
          if (step('password', { verified: true }) !== steps.confirm) {
            closeModal();
            return;
          }
          openModal(
            <AlertModal
              type="danger"
              title="Revoke sentinel"
              confirmLabel="Revoke"
              onDismiss={() => step('cancel')}
              onSuccess={() => {
                if (step('confirmed') !== steps.send) return;
                send(() => templates.revoke(), 'Revoking sentinel', 'Sentinel revoked');
              }}
            >
              <p>This address can never register a sentinel again. It cannot be undone.</p>
            </AlertModal>
          );
        }}
      >
        <p>The sentinel stops earning. Its 5,000 ZNN and 50,000 QSR return to this address.</p>
      </PasswordModal>
    );
  };

  const register = () =>
    openModal(
      <AlertModal
        type="confirm"
        title="Register a sentinel"
        confirmLabel="Register"
        onSuccess={() => {
          const row = { amount: stakeZnn.toString(), decimals, tokenSymbol: 'ZNN' };
          send(() => templates.register(), 'Registering sentinel', 'Sentinel registered', row);
        }}
      >
        <p>
          Lock <b>5,000 ZNN</b> and the <b>50,000 QSR</b> deposited? They can be taken back for 3 days in every 30.
        </p>
      </AlertModal>
    );

  const collect = () => {
    send(() => templates.collect(), 'Collecting rewards', 'Rewards collected');
  };

  const deposit = (amount) => {
    const row = { amount: amount.toString(), decimals, tokenSymbol: 'QSR' };
    if (send(() => templates.depositQsr(amount), 'Depositing QSR', 'QSR deposited', row)) setTimeout(refresh, 12000);
  };

  const withdraw = () => {
    if (send(() => templates.withdrawQsr(), 'Withdrawing QSR', 'QSR withdrawn')) setTimeout(refresh, 12000);
  };

  if (isLoading) {
    return <div className="page"><p className="empty-note">Loading…</p></div>;
  }

  const state = sentinelState(sentinel);

  return (
    <div className="page">
      {error && <p className="notice is-warning">The node did not answer. These figures may be old.</p>}

      {state === 'active' && (
        <Owned sentinel={sentinel} activeCount={activeCount} uncollected={uncollected} onCollect={collect} onRevoke={revoke} />
      )}
      {state === 'revoked' && (
        <Revoked qsrDeposited={qsrDeposited} uncollected={uncollected} onCollect={collect} onWithdraw={withdraw} />
      )}
      {state === 'none' && (
        <Unregistered
          znnBalance={balanceMap[znnZts]?.balance}
          qsrBalance={balanceMap[qsrZts]?.balance}
          qsrDeposited={qsrDeposited}
          onDeposit={deposit}
          onWithdraw={withdraw}
          onRegister={register}
        />
      )}
    </div>
  );
};

export default Sentinel;
