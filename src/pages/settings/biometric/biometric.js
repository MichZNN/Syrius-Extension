import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import Icon from '../../../components/icon/icon';
import { notify } from '../../../services/utils/notify';
import app from '../../../services/utils/app';
import vault from '../../../services/wallet/vault';

// Fingerprint unlock, in the app (platform/nativeFeatures.js).
//
// Turning it on proves the password first, as changing it does: an unlocked
// wallet left on a table must not let someone else's fingerprint in for good.
// The password then goes into the Android Keystore under a key that needs a
// fingerprint to open; the phone asks for one to store it.

const Biometric = () => {
  const navigate = useNavigate();
  const walletName = vault.getWalletName();
  // null until the phone has answered.
  const [state, setState] = useState(null);
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { register, handleSubmit, formState: { errors }, setError, setValue } = useForm({ mode: 'onSubmit' });

  useEffect(() => {
    const native = app();
    if (!native) {
      setState('absent');
      return;
    }
    Promise.all([native.biometric.available(), native.biometric.enabled(walletName)])
      .then(([available, enabled]) => setState(enabled ? 'on' : available ? 'off' : 'absent'));
  }, [walletName]);

  const turnOn = async () => {
    setIsSaving(true);
    try {
      const lifetime = vault.capture();
      if (!(await vault.verifyPassword(password))) {
        setError('passwordField', { message: 'Wrong password' });
        return;
      }
      if (!vault.isCurrent(lifetime)) return;
      await app().biometric.enable(walletName, password);
      setPassword('');
      notify.success('Fingerprint unlock on');
      navigate('/tabs/settings', { replace: true });
    } catch (error) {
      notify.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const turnOff = async () => {
    await app()?.biometric.disable(walletName);
    setState('off');
    notify.success('Fingerprint unlock off');
  };

  if (state === null) return <div className="page" />;

  if (state === 'absent') {
    return (
      <div className="page">
        <p className="text-gray">Add a fingerprint in the phone&apos;s settings first.</p>
      </div>
    );
  }

  if (state === 'on') {
    return (
      <div className="page">
        <div className="biometric-state">
          <Icon name="fingerprint" size={32} />
          <span>On for {walletName}</span>
        </div>
        <button type="button" className="button danger-text w-100" onClick={turnOff}>
          Turn off
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <form onSubmit={handleSubmit(turnOn)}>
        <div className="custom-control">
          <input
            {...register('passwordField', { required: 'Enter the wallet password' })}
            className={`w-100 custom-label ${errors.passwordField ? 'custom-label-error' : ''}`}
            placeholder="Wallet password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setValue('passwordField', event.target.value, { shouldValidate: true });
            }}
          />
          <div className={`input-error ${errors.passwordField ? '' : 'invisible'}`}>
            {errors.passwordField?.message || ' '}
          </div>
        </div>
        <button type="submit" className="button primary w-100 text-white" disabled={isSaving}>
          {isSaving ? 'Turning on…' : 'Turn on'}
        </button>
      </form>
    </div>
  );
};

export default Biometric;
