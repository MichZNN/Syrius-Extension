import React, { useContext } from 'react';

import Icon from '../icon/icon';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import { formatAmount, truncateAddress } from '../../services/utils/format';

// A zap: who it came from, or for one this wallet sent, who it went to; what
// moved; and the message.
//
// The message is a stranger's. It was cut to one printable line when it was
// decoded (services/zap/zap.js) and it is rendered here as text and nothing
// else: no link is made of it and no markup in it is read.

const ZapModal = ({ counterparty, sent = false, amount, decimals, tokenSymbol, message }) => {
  const { closeModal } = useContext(ModalContext);

  return (
    <div className="alert-modal zap-modal">
      <div className="modal-header">
        <span>Zap</span>
        <button type="button" className="icon-button" onClick={closeModal} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="modal-divider green" />

      <div className="modal-content">
        <div className="zap-modal-glyph">
          <Icon name="party" size={26} />
        </div>
        <p className="zap-modal-message">{message}</p>
        <p className="zap-modal-meta">
          <span className="mono">{formatAmount(amount, decimals)} {tokenSymbol}</span>
          <span className="mono" title={counterparty}>{sent ? 'To' : 'From'} {truncateAddress(counterparty)}</span>
        </p>
        {!sent && <p className="zap-modal-note">Written by the sender, not by Syrius.</p>}

        <div className="modal-action-area">
          <button type="button" className="button primary w-100" onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZapModal;
