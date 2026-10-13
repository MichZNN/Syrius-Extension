import React, { useContext, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import AlertModal from '../../components/modals/alert-modal';
import { Address } from '../../components/data/data';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import { reads, templates } from '../../services/pillar/calls';
import {
  decimals,
  percentageError,
  pillarChanges,
  pillarNameError,
  pillarStakeZnn,
  userAddressError,
} from '../../services/pillar/rules';
import { notify } from '../../services/utils/notify';
import { fail } from '../../services/utils/errors';
import usePopupState from '../../services/utils/popupState';

// Registering a pillar, and updating one: the same four settings, plus the
// name when it is new. An update rewrites all four, so the confirmation lists
// only what would change and refuses to send a block that changes nothing.
//
// Every field is checked with the contract's own rules before a block is
// built (services/pillar/rules.js). A Register the contract refuses has
// already carried 15,000 ZNN to it and back.

const Field = ({ label, error, children }) => (
  <label className="field">
    <span className="ledger-label">{label}</span>
    {children}
    <span className="input-error">{error || ''}</span>
  </label>
);

const PillarForm = ({ mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address } = useAccount({ balances: false });
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const current = mode === 'update' ? location.state?.pillar : null;
  const [form, setForm] = usePopupState(`pillar.${mode}`, () => ({
    name: current?.name || '',
    producerAddress: current?.producerAddress || '',
    withdrawAddress: current?.withdrawAddress || address || '',
    momentumPercent: String(current?.giveMomentumRewardPercentage ?? 0),
    delegatePercent: String(current?.giveDelegateRewardPercentage ?? 100),
  }));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Opened without a pillar to edit (a reload, a typed address): back to the tab.
  if (mode === 'update' && !current) {
    return <Navigate to="/tabs/pillar" replace />;
  }

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value.trim() }));

  const errors = {
    name: mode === 'register' ? pillarNameError(form.name) : null,
    producerAddress: userAddressError(form.producerAddress),
    withdrawAddress: userAddressError(form.withdrawAddress),
    momentumPercent: percentageError(form.momentumPercent),
    delegatePercent: percentageError(form.delegatePercent),
  };
  const isValid = Object.values(errors).every((error) => !error);
  const shown = (key) => (touched ? errors[key] : null);

  const next = {
    producerAddress: form.producerAddress,
    withdrawAddress: form.withdrawAddress,
    giveMomentumRewardPercentage: Number(form.momentumPercent),
    giveDelegateRewardPercentage: Number(form.delegatePercent),
  };
  const changes = current ? pillarChanges(current, next) : [];

  const send = () => {
    try {
      const template = mode === 'register' ? templates.register(form) : templates.update(form);
      sendInBackground(template, {
        successMessage: mode === 'register' ? `${form.name} registered` : `${form.name} updated`,
        row: {
          owner: address,
          label: mode === 'register' ? `Registering ${form.name}` : `Updating ${form.name}`,
          ...(mode === 'register'
            ? { amount: pillarStakeZnn.toString(), decimals, tokenSymbol: 'ZNN' }
            : {}),
        },
      });
      navigate('/tabs/pillar');
    } catch (err) {
      notify.error(err);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid || busy) return;

    if (mode === 'update') {
      if (!changes.length) {
        notify.error(fail(403));
        return;
      }
      openModal(
        <AlertModal type="confirm" title={`Update ${form.name}`} confirmLabel="Update" onSuccess={send}>
          <dl className="confirm-details">
            {changes.map((change) => (
              <React.Fragment key={change.key}>
                <dt>{change.label}</dt>
                <dd className="mono">
                  {change.key.endsWith('Address') ? <Address value={change.to} /> : `${change.to}%`}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </AlertModal>
      );
      return;
    }

    // The name is the one thing only the node can check.
    setBusy(true);
    try {
      if (!(await reads.nameAvailable(form.name))) {
        notify.error(fail(404, { name: form.name }));
        return;
      }
    } catch (err) {
      notify.error(err);
      return;
    } finally {
      setBusy(false);
    }

    openModal(
      <AlertModal type="confirm" title="Register pillar" confirmLabel="Register" onSuccess={send}>
        <p>
          Stake <b>15,000 ZNN</b> and burn the deposited QSR to register <b>{form.name}</b>? The ZNN
          is locked for 83 days. The QSR is not returned.
        </p>
      </AlertModal>
    );
  };

  return (
    <div className="page">
      <form onSubmit={submit} noValidate>
        {mode === 'register' ? (
          <Field label="Name" error={shown('name')}>
            <input
              className={`custom-label ${shown('name') ? 'custom-label-error' : ''}`}
              value={form.name}
              onChange={set('name')}
              maxLength={40}
              autoComplete="off"
              spellCheck="false"
            />
          </Field>
        ) : (
          <h1 className="pillar-title">{form.name}</h1>
        )}

        <Field label="Producer address" error={shown('producerAddress')}>
          <input
            className={`custom-label mono ${shown('producerAddress') ? 'custom-label-error' : ''}`}
            value={form.producerAddress}
            onChange={set('producerAddress')}
            placeholder="z1…"
            autoComplete="off"
            spellCheck="false"
          />
        </Field>

        <Field label="Reward address" error={shown('withdrawAddress')}>
          <input
            className={`custom-label mono ${shown('withdrawAddress') ? 'custom-label-error' : ''}`}
            value={form.withdrawAddress}
            onChange={set('withdrawAddress')}
            placeholder="z1…"
            autoComplete="off"
            spellCheck="false"
          />
        </Field>

        <div className="field-row">
          <Field label="Momentum rewards shared, %" error={shown('momentumPercent')}>
            <input
              className={`custom-label mono ${shown('momentumPercent') ? 'custom-label-error' : ''}`}
              inputMode="numeric"
              value={form.momentumPercent}
              onChange={set('momentumPercent')}
              autoComplete="off"
            />
          </Field>
          <Field label="Delegation rewards shared, %" error={shown('delegatePercent')}>
            <input
              className={`custom-label mono ${shown('delegatePercent') ? 'custom-label-error' : ''}`}
              inputMode="numeric"
              value={form.delegatePercent}
              onChange={set('delegatePercent')}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="sticky-actions">
          <button type="submit" className="button primary w-100" disabled={busy}>
            {mode === 'register' ? 'Register' : 'Update'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PillarForm;
