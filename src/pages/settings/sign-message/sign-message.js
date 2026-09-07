import React, { useState } from 'react';
import { useSelector } from 'react-redux';

import {
  signMessage,
  messageProblem,
  maxMessageLength,
} from '../../../services/wallet/signMessage';
import { copyToClipboard, notify } from '../../../services/utils/notify';
import { truncateAddress } from '../../../services/utils/format';

// Signing a message by hand.
//
// The dApp flow covers a site that asks for a signature; this is the other
// half — proving an address is yours to something that cannot ask the wallet
// itself. A forum post, a support ticket, an exchange's proof-of-ownership
// form: somebody hands you a phrase, you sign it here and paste back the two
// hex strings.
//
// No password re-entry, unlike the backup phrase screen. A signature reveals
// nothing about the key, and the message is the person's own.

const SignedField = ({ label, value, copyLabel }) => (
  <div className="signed-field">
    <div className="signed-field-head">
      <span className="signed-field-label">{label}</span>
      <button
        type="button"
        className="thin-button secondary"
        onClick={() => copyToClipboard(value, copyLabel)}
      >
        Copy
      </button>
    </div>
    <div className="signed-field-value">{value}</div>
  </div>
);

const SignMessage = () => {
  const { address } = useSelector((state) => state.wallet);

  const [message, setMessage] = useState('');
  const [signed, setSigned] = useState(null);
  const [isSigning, setIsSigning] = useState(false);

  // Only complained about once there is something to complain about — an empty
  // box is not an error, it is a box nobody has typed in yet.
  const problem = message.length ? messageProblem(message) : null;

  const sign = async () => {
    setIsSigning(true);

    try {
      setSigned(await signMessage(message));
    } catch (err) {
      notify.error(err);
    } finally {
      setIsSigning(false);
    }
  };

  if (signed) {
    return (
      <div className="page">
        <p className="approval-note">
          Signed by {truncateAddress(address, 10, 6)}. Whoever asked for this
          needs the message, the public key and the signature.
        </p>

        <pre className="message-preview">{signed.message}</pre>

        <SignedField
          label="Public key"
          value={signed.publicKey}
          copyLabel="Public key copied"
        />
        <SignedField
          label="Signature"
          value={signed.signature}
          copyLabel="Signature copied"
        />

        <div className="action-row sticky-actions">
          <button
            type="button"
            className="button secondary w-100"
            onClick={() => {
              setSigned(null);
              setMessage('');
            }}
          >
            Sign another
          </button>
          <button
            type="button"
            className="button primary w-100 text-white"
            onClick={() =>
              copyToClipboard(
                JSON.stringify(signed, null, 2),
                'Signature copied'
              )
            }
          >
            Copy all
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="approval-note">
        Signs a message with the key behind {truncateAddress(address, 10, 6)}.
        Nothing is sent to the network and nothing is spent.
      </p>

      <div className="custom-control">
        <textarea
          className={`custom-label message-input ${
            problem ? 'custom-label-error' : ''
          }`}
          placeholder="The message to sign"
          maxLength={maxMessageLength}
          autoFocus
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div
          className={`input-error long-error-message ${
            problem ? '' : 'invisible'
          }`}
        >
          {problem || ' '}
        </div>
      </div>

      <button
        type="button"
        className="button primary w-100 text-white sticky-actions"
        onClick={sign}
        disabled={isSigning || !message.length || Boolean(problem)}
      >
        {isSigning ? 'Signing…' : 'Sign message'}
      </button>
    </div>
  );
};

export default SignMessage;
