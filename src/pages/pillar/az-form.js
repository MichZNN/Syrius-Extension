/* global BigInt */
import React, { useContext, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import AlertModal from '../../components/modals/alert-modal';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import { templates } from '../../services/pillar/calls';
import {
  currentPhase,
  decimals,
  phaseFundsLeft,
  projectCreationZnn,
  projectDescriptionMaxLength,
  projectError,
  projectNameMaxLength,
} from '../../services/pillar/rules';
import { formatAmount, formatExact, parseAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';
import usePopupState from '../../services/utils/popupState';

// Submitting an Accelerator-Z project, and adding or replacing a phase of one.
// The contract takes the same five fields for all three, with the same limits
// (services/pillar/rules.js), so it is one form.
//
// Updating a phase replaces it and clears its votes; the confirmation says so.
//
// A phase may ask for what the project has left (rules.js phaseFundsLeft):
// Max fills that in, and more is refused here rather than by the contract.

const titles = { new: 'New project', add: 'Add phase', update: 'Update phase' };

const AzForm = ({ mode: routeMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address } = useAccount({ balances: false });
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const project = routeMode === 'phase' ? location.state?.project : null;
  const mode = routeMode === 'phase' ? location.state?.mode : 'new';
  const editing = mode === 'update' ? currentPhase(project)?.phase : null;

  const [form, setForm] = usePopupState(`az.${mode}.${project?.id || 'new'}`, () => ({
    name: editing?.name || '',
    description: editing?.description || '',
    url: editing?.url || '',
    znn: editing ? formatExact(editing.znnFundsNeeded, decimals) : '',
    qsr: editing ? formatExact(editing.qsrFundsNeeded, decimals) : '',
  }));
  const [touched, setTouched] = useState(false);

  // Opened without a project (a reload, a typed address): back to the tab.
  if (routeMode === 'phase' && (!project || !titles[mode])) {
    return <Navigate to="/tabs/az" replace />;
  }

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const left = project ? phaseFundsLeft(project, mode) : null;
  const plain = (amount) => formatAmount(amount.toString(), decimals, { maxDecimals: decimals, group: false });
  const fillMax = (key) => setForm((previous) => ({ ...previous, [key]: plain(left[key]) }));

  const znn = parseAmount(form.znn || '0', decimals);
  const qsr = parseAmount(form.qsr || '0', decimals);
  const values = {
    name: form.name.trim(),
    description: form.description.trim(),
    url: form.url.trim(),
    znn: znn?.toString() ?? '-1',
    qsr: qsr?.toString() ?? '-1',
  };
  const overLeft = (key, amount) => left && amount !== null && BigInt(amount.toString()) > left[key];
  const error = znn === null || qsr === null ? 'Enter the amounts as numbers.'
    : overLeft('znn', znn) ? `At most ${formatAmount(left.znn.toString(), decimals, { maxDecimals: decimals })} ZNN for this phase.`
      : overLeft('qsr', qsr) ? `At most ${formatAmount(left.qsr.toString(), decimals, { maxDecimals: decimals })} QSR for this phase.`
        : projectError(values);

  const send = () => {
    try {
      const template =
        mode === 'new'
          ? templates.createProject(values)
          : templates[mode === 'add' ? 'addPhase' : 'updatePhase'](project.id, values);
      sendInBackground(template, {
        successMessage: `${values.name} submitted`,
        row: {
          owner: address,
          label: `Submitting ${values.name}`,
          ...(mode === 'new'
            ? { amount: projectCreationZnn.toString(), decimals, tokenSymbol: 'ZNN' }
            : {}),
        },
      });
      navigate('/tabs/az');
    } catch (err) {
      notify.error(err);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (error) return;

    openModal(
      <AlertModal type="confirm" title={titles[mode]} confirmLabel="Submit" onSuccess={send}>
        {mode === 'new' && <p>Submitting <b>{values.name}</b> costs <b>1 ZNN</b>, which is not returned.</p>}
        {mode === 'add' && <p>Add <b>{values.name}</b> to <b>{project.name}</b> for pillars to vote on?</p>}
        {mode === 'update' && <p>Replace the open phase of <b>{project.name}</b>? Its votes are cleared.</p>}
      </AlertModal>
    );
  };

  return (
    <div className="page">
      <form onSubmit={submit} noValidate>
        {project && <h1 className="pillar-title">{project.name}</h1>}

        <label className="field">
          <span className="ledger-label">Name</span>
          <input
            className="custom-label"
            value={form.name}
            onChange={set('name')}
            maxLength={projectNameMaxLength}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="ledger-label">Description</span>
          <textarea
            className="custom-label message-input"
            value={form.description}
            onChange={set('description')}
            maxLength={projectDescriptionMaxLength}
          />
        </label>

        <label className="field">
          <span className="ledger-label">Link</span>
          <input
            className="custom-label mono"
            value={form.url}
            onChange={set('url')}
            placeholder="forum.zenon.org/t/…"
            autoComplete="off"
            spellCheck="false"
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="ledger-label">ZNN</span>
            <div className="input-with-button w-100">
              <input
                className="custom-label mono w-100"
                inputMode="decimal"
                value={form.znn}
                onChange={set('znn')}
                placeholder="0"
                autoComplete="off"
              />
              {left && (
                <button type="button" className="input-chip-button" onClick={() => fillMax('znn')}
                  title={`${formatExact(left.znn.toString(), decimals)} ZNN left`}>
                  Max
                </button>
              )}
            </div>
          </label>
          <label className="field">
            <span className="ledger-label">QSR</span>
            <div className="input-with-button w-100">
              <input
                className="custom-label mono w-100"
                inputMode="decimal"
                value={form.qsr}
                onChange={set('qsr')}
                placeholder="0"
                autoComplete="off"
              />
              {left && (
                <button type="button" className="input-chip-button" onClick={() => fillMax('qsr')}
                  title={`${formatExact(left.qsr.toString(), decimals)} QSR left`}>
                  Max
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="input-error">{touched && error ? error : ''}</div>

        <div className="sticky-actions">
          <button type="submit" className="button primary w-100">
            {titles[mode]}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AzForm;
