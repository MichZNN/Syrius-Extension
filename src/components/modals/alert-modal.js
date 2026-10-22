import React, { useContext } from 'react';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import Icon from '../icon/icon';

// The confirmation dialog.
//
// Its `returnModalDividerClass` and `returnModalButtons` switches had no
// default branch, so a type it did not recognise rendered a dialog with no
// buttons at all — dismissable only by clicking the backdrop.
//
// It does not name the signing chain or the node: the header chip already
// does, on every screen the wallet's own actions start from. A site's request
// still shows both (layouts/siteIntegrationLayout), where no chip is in view.

const styles = {
  confirm: { accent: 'green', confirmLabel: 'Confirm', confirmClass: 'primary' },
  warning: { accent: 'warning', confirmLabel: 'Proceed', confirmClass: 'warning' },
  danger: { accent: 'warning', confirmLabel: 'Remove', confirmClass: 'warning' },
};

const AlertModal = ({ children, title, type = 'confirm', onDismiss, onSuccess, confirmLabel, confirmDisabled = false, dismissLabel = 'Cancel' }) => {
  const { closeModal } = useContext(ModalContext);
  const style = styles[type] || styles.confirm;

  const dismiss = () => {
    closeModal();
    onDismiss?.();
  };

  const confirm = () => {
    closeModal();
    onSuccess?.();
  };

  return (
    <div className="alert-modal" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="modal-header" style={{ flexShrink: 0 }}>
        <span>{title}</span>
        <button type="button" className="icon-button" onClick={dismiss} aria-label="Close" data-modal-dismiss>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className={`modal-divider ${style.accent}`} style={{ flexShrink: 0 }} />

      <div className="modal-content" style={{ minHeight: 0, overflowY: 'auto' }}>
        {children}

        <div className="modal-action-area">
          {/* "Cancel" beside "Cancel fuse" reads as the same button twice, so a
              dialog whose action is itself a cancellation names the other one. */}
          <button type="button" className="button secondary w-100" onClick={dismiss} data-modal-dismiss>
            {dismissLabel}
          </button>
          <button
            type="button"
            className={`button ${style.confirmClass} w-100`}
            disabled={confirmDisabled}
            onClick={confirm}
          >
            {confirmLabel || style.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
