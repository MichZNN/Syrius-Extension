import React from 'react';
import QRCode from 'react-qr-code';
import { useSelector } from 'react-redux';

import { copyToClipboard } from '../../../services/utils/notify';
import { getLabel } from '../../../services/utils/storage';

// Receiving.
//
// It re-opened the keystore on mount purely to learn its own address — which
// the store already knows — and then told the person that "this address can
// only be used to receive ZNN or QSR", which is not true: it receives any ZTS
// on the network, and the wallet now has a screen that shows them.

const Receive = () => {
  const address = useSelector((state) => state.wallet.address);
  const label = getLabel(address);

  return (
    <div className="page receive-screen">
      {label && <div className="receive-label">{label}</div>}

      <div className="qr-frame">
        {address && <QRCode bgColor="#151515" fgColor="#00E721" value={address} level="M" size={168} />}
      </div>

      <button
        type="button"
        className="receive-address"
        onClick={() => copyToClipboard(address, 'Address copied')}
      >
        <span className="word-break-all">{address}</span>
        <img alt="" src={require('./../../../assets/copy-icon.png')} width="12" />
      </button>

      <p className="text-gray text-xs">Send any Zenon token to this address</p>
    </div>
  );
};

export default Receive;
