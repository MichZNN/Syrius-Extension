import React, { useState } from 'react';

import Icon from '../icon/icon';
import app, { biometricIcon, biometricName } from '../../services/utils/app';
import { notify } from '../../services/utils/notify';
import useAppLock from '../../services/hooks/useAppLock';

// The last step of creating or importing a wallet in the app: unlock it with
// the phone's biometrics from now on. Offered only where the phone has them
// set up and the wallet does not use them yet (shouldOffer). Settings can
// turn it on later the same way (pages/settings/biometric).
//
// The password is the one just typed on the screen that shows this, still in
// its state: it is never put in the router's state, which the hash router
// keeps in the session history.

const shouldOffer = async (walletName) => {
  const native = app();
  if (!native) return false;
  try {
    return (await native.biometric.available()) && !(await native.biometric.enabled(walletName));
  } catch (error) {
    return false;
  }
};

const BiometricOffer = ({ walletName, password, onDone }) => {
  useAppLock();
  const [isSaving, setIsSaving] = useState(false);

  const turnOn = async () => {
    setIsSaving(true);
    try {
      // The phone asks for the fingerprint or face to store the password.
      await app().biometric.enable(walletName, password);
      notify.success(`${biometricName()} unlock on`);
      onDone();
    } catch (error) {
      // Cancelled at the prompt, or refused: the wallet is ready either way.
      notify.error(error);
      setIsSaving(false);
    }
  };

  return (
    <div className="biometric-offer">
      <div className="biometric-state">
        <Icon name={biometricIcon()} size={32} />
        <span>Unlock with {biometricName()}?</span>
      </div>
      <button type="button" className="button primary w-100 text-white" disabled={isSaving} onClick={turnOn}>
        {isSaving ? 'Turning on…' : 'Turn on'}
      </button>
      <button type="button" className="button secondary w-100" disabled={isSaving} onClick={onDone}>
        Not now
      </button>
    </div>
  );
};

export { shouldOffer };
export default BiometricOffer;
