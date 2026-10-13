import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import AlertModal from '../../../components/modals/alert-modal';
import PasswordModal from '../../../components/modals/password-modal';
import { Status } from '../../../components/data/data';
import { ModalContext } from '../../../services/hooks/modal/modalContext';
import useAccount from '../../../services/hooks/useAccount';
import useBackgroundSender from '../../../services/hooks/useBackgroundSender';
import useChainChange from '../../../services/hooks/useChainChange';
import {
  activationGate,
  descriptionMax,
  mayActivate,
  nameMax,
  reads,
  sporkError,
  sporkRole,
  sporkState,
  templates,
} from '../../../services/spork/spork';
import { truncateHash } from '../../../services/utils/format';
import { notify } from '../../../services/utils/notify';
import usePopupState from '../../../services/utils/popupState';

// Sporks (Settings): every spork on this chain and whether it is enforced.
//
// An address that administers sporks here (services/spork/spork.js) also gets
// Activate on each inactive spork and a form to create one. Activating turns a
// protocol feature on for the whole network and cannot be undone, so it asks
// for the wallet password and then once more, as Revoke does. For a spork znnd
// does not implement, the second question is its name, typed.

const states = {
  active: { kind: 'success', label: 'Active' },
  activating: { kind: 'pending', label: 'Activating' },
  inactive: { kind: 'neutral', label: 'Inactive' },
};

// The last question before ActivateSpork. A spork znnd implements gets the
// plain dialog. Any other id stops every node that does not list it
// (services/spork/spork.js), so its name has to be typed out first.
const ActivateConfirm = ({ spork, onSuccess }) => {
  const [typed, setTyped] = useState('');
  const known = activationGate(spork.id) === 'confirm';
  return (
    <AlertModal
      type="danger"
      title={`Activate ${spork.name}`}
      confirmLabel="Activate"
      confirmDisabled={!mayActivate(spork, typed)}
      onSuccess={() => mayActivate(spork, typed) && onSuccess()}
    >
      {known ? (
        <p>
          <b>{spork.name}</b> is enforced on every node six momentums after this lands. It cannot be
          turned off.
        </p>
      ) : (
        <>
          <p className="notice is-danger">
            Syrius does not know this spork. Every node that does not implement it stops six
            momentums after this lands. It cannot be turned off.
          </p>
          <input
            className="custom-label mono"
            placeholder={spork.name}
            aria-label="Type the spork name to activate"
            autoComplete="off"
            spellCheck="false"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </>
      )}
    </AlertModal>
  );
};

const Sporks = () => {
  const { address } = useAccount({ balances: false });
  const { chainIdentifier } = useSelector((state) => state.connectionParameters);
  const { openModal, closeModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const [sporks, setSporks] = useState(null);
  const [height, setHeight] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = usePopupState('sporks.form', { name: '', description: '' });
  const [touched, setTouched] = useState(false);
  // The form stays folded behind a button so the list keeps the screen.
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, frontier] = await Promise.all([reads.all(), reads.height()]);
      setSporks(list);
      setHeight(frontier);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);
  useChainChange(() => load());

  const role = sporkRole({ address, chainIdentifier, height });

  const send = (template, label, successMessage) => {
    try {
      sendInBackground(template, { successMessage, row: { owner: address, label } });
      // The form folds away again; the list shows the spork once it confirms.
      setForm({ name: '', description: '' });
      setTouched(false);
      setCreating(false);
    } catch (err) {
      notify.error(err);
    }
  };

  // Password, then the last question, then the block.
  const activate = (spork) =>
    openModal(
      <PasswordModal
        title={`Activate ${spork.name}`}
        onVerified={() =>
          openModal(
            <ActivateConfirm
              spork={spork}
              onSuccess={() => send(templates.activate(spork.id), `Activating ${spork.name}`, `${spork.name} activated`)}
            />
          )
        }
        onDismiss={closeModal}
      >
        <p>Activating a spork changes the protocol for the whole network.</p>
      </PasswordModal>
    );
  const values = { name: form.name.trim(), description: form.description.trim() };
  const formError = sporkError(values);

  const create = (event) => {
    event.preventDefault();
    setTouched(true);
    if (formError) return;
    openModal(
      <AlertModal
        type="confirm"
        title="Create spork"
        confirmLabel="Create"
        onSuccess={() => send(templates.create(values), `Creating ${values.name}`, `${values.name} created`)}
      >
        <p>Create <b>{values.name}</b>? It stays inactive until activated.</p>
      </AlertModal>
    );
  };

  return (
    <div className="page">
      {role && (
        <p className="notice is-info">
          {role === 'genesis' ? 'This address administers sporks on this chain.' : 'The community spork window is open.'}
        </p>
      )}

      <div className="list">
        {(sporks || []).map((spork) => {
          const state = states[sporkState(spork, height)];
          return (
            <div className="spork-row" key={spork.id}>
              <div className="spork-main">
                <div className="spork-name">{spork.name}</div>
                {spork.description && spork.description !== spork.name && (
                  <div className="spork-description">{spork.description}</div>
                )}
                <div className="spork-meta mono" title={spork.id}>
                  {truncateHash(spork.id)}
                  {spork.activated && Number(spork.enforcementHeight) > 0 && ` · from ${spork.enforcementHeight}`}
                </div>
              </div>
              <div className="spork-side">
                <Status kind={state.kind}>{state.label}</Status>
                {role && !spork.activated && (
                  <button type="button" className="thin-button danger-text" onClick={() => activate(spork)}>
                    Activate
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {sporks && !sporks.length && <p className="empty-note">None yet</p>}
        {!sporks && !error && <p className="empty-note">Loading…</p>}
        {!sporks && error && <p className="empty-note">Could not load</p>}
      </div>

      {role && !creating && (
        <div className="page-footer">
          <button type="button" className="button primary w-100" onClick={() => setCreating(true)}>
            New spork
          </button>
        </div>
      )}

      {role && creating && (
        <form className="page-footer spork-form" onSubmit={create} noValidate>
          <input
            className="custom-label mono"
            placeholder="Name"
            aria-label="Spork name"
            maxLength={nameMax}
            autoComplete="off"
            spellCheck="false"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="custom-label"
            placeholder="Description"
            aria-label="Spork description"
            maxLength={descriptionMax}
            autoComplete="off"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <div className="input-error">{touched && formError ? formError : ''}</div>
          <div className="action-row">
            <button type="button" className="button secondary w-100" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="button primary w-100">
              Create
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Sporks;
