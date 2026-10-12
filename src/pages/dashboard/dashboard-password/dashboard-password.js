import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import MenuHeader from '../../menu/menu-header/menu-header';
import Icon from '../../../components/icon/icon';
import ControlledDropdown from '../../../components/custom-dropdown/controlled-dropdown';
import { useForm } from 'react-hook-form';

import { completeUnlock } from '../../../services/wallet/bootstrap';
import { loadStorageWalletNames } from '../../../services/utils/utils';
import { getLastWalletName } from '../../../services/utils/storage';
import { readDevWalletConfig } from '../../../services/utils/devWallet';
import NodeStall from '../../../components/node-stall/node-stall';
import { ringInPhase, spinOnce } from '../../../services/utils/edgeLight';
import { describe, fail, wrongPassword as wrongPasswordId } from '../../../services/utils/errors';
import { notify } from '../../../services/utils/notify';
import { currentVersion, latestVersion, releaseState, releasesUrl } from '../../../services/utils/release';
import app, { biometricIcon, biometricName } from '../../../services/utils/app';

// The unlock screen.
//
// What used to be here, besides the form: a full three.js scene — perspective
// camera, point light, directional light, a textured sphere and a
// `mousemove` listener that made it follow the pointer. That is 1.13 MiB of
// the bundle and a WebGL context, on the screen whose entire job is to accept a
// password quickly. It is gone.

// How long the opened mark is shown before the wallet takes the screen.
const openedFor = 420;

// The ring's light is one animation that is never restarted and never changes
// pace while the password is being checked: a wrong password leaves it exactly
// as it was. Only a successful unlock moves it, by one extra eased turn from
// wherever it is (services/utils/edgeLight.js).

const DashboardPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [walletNames, setWalletNames] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState('');
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  // The password was right and the wallet is open: the mark says so, briefly.
  const [isOpen, setIsOpen] = useState(false);
  // The newest release, when it is newer than this one. Asked of GitHub at
  // most once in six hours (services/utils/release.js); nothing shows
  // otherwise.
  const [update, setUpdate] = useState(null);
  // In the app, whether the chosen wallet opens with a fingerprint
  // (pages/settings/biometric). The prompt comes up by itself once per visit
  // to this screen; after that it waits for the button.
  const [fingerprint, setFingerprint] = useState(false);
  const prompted = useRef(false);
  const passwordInput = useRef(null);
  const ring = useRef(null);
  const setRing = useCallback((element) => {
    ring.current = element;
    ringInPhase(element);
  }, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm();

  // Where to go once the wallet opens. A dApp approval sets this so the request
  // that opened the popup is not lost behind the password prompt.
  const returnTo = location.state?.returnTo || '/tabs/dashboard';

  const passwordField = register('passwordField', { required: true });

  const unlock = async (walletPassword, walletName, { byFingerprint = false } = {}) => {
    if (!walletName) {
      notify.error(fail(218));
      return;
    }
    setIsUnlocking(true);
    setWrongPassword(false);

    try {
      await completeUnlock({ walletName, password: walletPassword, dispatch });
      setIsOpen(true);
      await new Promise((resolve) => { setTimeout(resolve, openedFor); });
      navigate(returnTo, { replace: true });
    } catch (err) {
      const { id } = describe(err);

      // A wrong password is the expected outcome here, not an incident. It gets
      // inline treatment on the field; anything else is a real error.
      if (id === wrongPasswordId) {
        // A stored password that no longer opens the wallet (changed on
        // another copy of it) is of no further use.
        if (byFingerprint) {
          await app()?.biometric.disable(walletName);
          setFingerprint(false);
        }
        setWrongPassword(true);
        setPassword('');
        setValue('passwordField', '', { shouldValidate: false });
        passwordInput.current?.focus();
      } else {
        notify.error(err);
      }
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    const wallets = loadStorageWalletNames();
    setWalletNames(wallets);

    // Returns null in every build that is not being driven by the dev harness,
    // which leaves this screen exactly as it is for everybody else.
    const devWallet = readDevWalletConfig();

    if (devWallet) {
      setSelectedWallet(devWallet.walletName);
      setValue('selectedWalletField', devWallet.walletName, { shouldValidate: true });
      unlock(devWallet.password, devWallet.walletName);
      return;
    }

    // One wallet is the overwhelmingly common case; preselecting it turns the
    // screen into a single field. With more than one, default to whichever
    // unlocked last rather than leaving the picker blank every time.
    const preselected =
      wallets.length === 1 ? wallets[0] : wallets.find((name) => name === getLastWalletName());

    if (preselected) {
      setSelectedWallet(preselected);
      setValue('selectedWalletField', preselected, { shouldValidate: true });
    }
    passwordInput.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlockWithFingerprint = async (walletName) => {
    try {
      const stored = await app().biometric.unlock(walletName);
      if (stored) await unlock(stored, walletName, { byFingerprint: true });
      else passwordInput.current?.focus();
    } catch (error) {
      setFingerprint(false);
      notify.error(error);
    }
  };

  useEffect(() => {
    const native = app();
    if (!native || !selectedWallet) {
      setFingerprint(false);
      return undefined;
    }
    let mounted = true;
    native.biometric.enabled(selectedWallet).then((enabled) => {
      if (!mounted) return;
      setFingerprint(enabled);
      if (enabled && !prompted.current) {
        prompted.current = true;
        unlockWithFingerprint(selectedWallet);
      }
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWallet]);

  useEffect(() => {
    if (isOpen) spinOnce(ring.current, openedFor);
  }, [isOpen]);

  useEffect(() => {
    let mounted = true;
    latestVersion().then((latest) => {
      if (mounted && releaseState(latest, currentVersion()) === 'update') setUpdate(latest);
    });
    return () => { mounted = false; };
  }, []);

  const onSelectWallet = (index, value) => {
    setSelectedWallet(value);
    setValue('selectedWalletField', value, { shouldValidate: true });
  };

  return (
    <div className="black-bg screen">
      <MenuHeader changeNodeButton />

      <div className={`screen-body unlock-screen ${isOpen ? 'is-open' : ''}`}>
        {/* The mark, alive: light turning round it, a pulse leaving it, the
            logo drifting a little. The logo shakes its head at a wrong
            password; the light is left alone until the wallet opens. */}
        <div className={`brand-mark ${isOpen ? 'is-open' : wrongPassword ? 'is-refused' : ''}`}>
          <span className="brand-mark-ring" aria-hidden="true" ref={setRing} />
          <span className="brand-mark-pulse" aria-hidden="true" />
          <img alt="" src={require('../../../assets/logo.svg')} width="40" />
        </div>
        <h2 className="unlock-title">Welcome back</h2>

        <form onSubmit={handleSubmit(() => unlock(password, selectedWallet))}>
          {walletNames.length > 1 && (
            <div className="custom-control">
              <ControlledDropdown
                dropdownComponent="CustomDropdown"
                {...register('selectedWalletField', { required: true })}
                control={control}
                name="selectedWalletField"
                options={walletNames}
                onChange={onSelectWallet}
                value={selectedWallet}
                placeholder="Select wallet"
                className={errors.selectedWalletField ? 'custom-label-error' : ''}
              />
              <div className={`input-error ${errors.selectedWalletField ? '' : 'invisible'}`}>
                Choose a wallet
              </div>
            </div>
          )}

          <div className={`custom-control ${wrongPassword ? 'is-refused' : ''}`}>
            <input
              {...passwordField}
              ref={(element) => {
                // react-hook-form wants the node and so does the wrong-password
                // path, which puts the cursor back in the field.
                passwordField.ref(element);
                passwordInput.current = element;
              }}
              className={`w-100 custom-label ${
                errors.passwordField || wrongPassword ? 'custom-label-error' : ''
              }`}
              placeholder="Password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setWrongPassword(false);
                setValue('passwordField', event.target.value, { shouldValidate: true });
              }}
              type="password"
            />
            <div
              className={`input-error ${errors.passwordField || wrongPassword ? '' : 'invisible'}`}
            >
              {wrongPassword ? 'Wrong password' : 'Password is required'}
            </div>
          </div>

          <button
            type="submit"
            className={`button primary w-100 text-white ${isOpen ? 'is-unlocked' : ''}`}
            disabled={isUnlocking}
          >
            {isOpen && <Icon name="check" size={16} className="unlock-check" />}
            {isOpen ? 'Unlocked' : isUnlocking ? 'Unlocking…' : 'Unlock'}
          </button>
          {fingerprint && !isOpen && (
            <button
              type="button"
              className="button secondary w-100 unlock-fingerprint"
              disabled={isUnlocking}
              onClick={() => unlockWithFingerprint(selectedWallet)}
            >
              <Icon name={biometricIcon()} size={18} />
              {biometricName()}
            </button>
          )}
          {/* The unlock waits on the node; after 3 s this says so and offers a way on. */}
          {isUnlocking && <NodeStall />}
        </form>

        <div className="unlock-alternative text-gray">
          <span
            className="text-primary cursor-pointer"
            onClick={() => navigate('/auth/onboarding')}
          >
            Create or import a wallet
          </span>
        </div>

        {update && (
          <a className="unlock-update" href={releasesUrl} target="_blank" rel="noreferrer">
            <Icon name="download" size={14} />
            <span><span className="mono">{update}</span> available</span>
          </a>
        )}
      </div>
    </div>
  );
};

export default DashboardPassword;
