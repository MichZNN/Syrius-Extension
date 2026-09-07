import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { loadStorageWalletNames } from '../../services/utils/utils';

const Onboarding = () => {
  const navigate = useNavigate();
  const hasWallet = loadStorageWalletNames().length > 0;

  return (
    <div className="black-bg onboarding-layout onboarding-intro">
      <img alt="" className="onboarding-mark" src={require('./../../assets/logo.svg')} width="56" />

      <h1>Syrius</h1>
      <p className="text-gray">A wallet for Zenon, Network of Momentum.</p>

      <div className="onboarding-actions">
        <Link to="/auth/get-started" className="button primary w-100">
          Create a wallet
        </Link>
        <Link to="/auth/recovery" className="button secondary w-100">
          Import a recovery phrase
        </Link>
      </div>

      {/* Only offered when there is in fact a wallet to unlock. It used to be
          shown unconditionally, so a first-time user could follow it to a
          password screen with nothing to type a password for. */}
      {hasWallet && (
        <button type="button" className="text-link" onClick={() => navigate('/password')}>
          Unlock an existing wallet
        </button>
      )}
    </div>
  );
};

export default Onboarding;
