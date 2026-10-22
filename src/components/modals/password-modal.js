import React, { useContext, useState } from 'react';

import Icon from '../icon/icon';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import vault from '../../services/wallet/vault';
import { notify } from '../../services/utils/notify';

// Asks for the wallet password again before something that cannot be undone.
//
// An unlocked wallet left open should not be enough to end a pillar, so the
// caller's `onVerified` runs only after the vault has accepted the password.
// The dialog stays open on a wrong one and says so; closing it any other way
// calls `onDismiss`.

const PasswordModal = ({ title, children, continueLabel = 'Continue', onVerified, onDismiss }) => {
  const { closeModal } = useContext(ModalContext);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const dismiss = () => {
    closeModal();
    onDismiss?.();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isChecking || !password) return;
    setIsChecking(true);
    try {
      if (!(await vault.verifyPassword(password))) {
        setError('Wrong password');
        return;
      }
      // The caller opens what comes next; it replaces this dialog.
      onVerified?.();
    } catch (err) {
      notify.error(err);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="alert-modal">
      <div className="modal-header">
        <span>{title}</span>
        <button type="button" className="icon-button" onClick={dismiss} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="modal-divider warning" />

      <form className="modal-content" onSubmit={submit}>
        {children}

        <input
          className={`custom-label mt-2 ${error ? 'custom-label-error' : ''}`}
          type="password"
          placeholder="Wallet password"
          aria-label="Wallet password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(''); }}
        />
        <div className="input-error">{error}</div>

        <div className="modal-action-area">
          <button type="button" className="button secondary w-100" onClick={dismiss}>
            Cancel
          </button>
          <button type="submit" className="button warning w-100" disabled={!password || isChecking}>
            {isChecking ? 'Checking…' : continueLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PasswordModal;
