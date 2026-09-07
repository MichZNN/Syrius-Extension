import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  DEFAULT_AUTO_LOCK_MINUTES,
  getAutoLockMinutes,
  isValidAutoLockMinutes,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  setAutoLockMinutes,
} from '../../../services/security/autoLock';

/** Configure how long an inactive unlocked wallet session may remain open. */
const AutoLock = () => {
  const [minutes, setMinutes] = useState(String(DEFAULT_AUTO_LOCK_MINUTES));
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    getAutoLockMinutes()
      .then((storedMinutes) => {
        if (!isCancelled) {
          setMinutes(String(storedMinutes));
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setError('Could not load the auto-lock setting.');
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const saveSetting = async (event) => {
    event.preventDefault();
    setError('');

    if (!isValidAutoLockMinutes(minutes)) {
      setError(`Enter a whole number between ${MIN_AUTO_LOCK_MINUTES} and ${MAX_AUTO_LOCK_MINUTES}.`);
      return;
    }

    setIsSaving(true);

    try {
      await setAutoLockMinutes(minutes);
      toast('Auto-lock setting saved', {
        position: 'bottom-center',
        autoClose: 2500,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        newestOnTop: true,
        type: 'success',
        theme: 'dark',
      });
    } catch {
      setError('Could not save the auto-lock setting.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="black-bg">
      <h1 className="mt-1">Auto-lock</h1>

      <div className="mt-2 ml-2 mr-2">
        <p className="text-gray text-left">
          Keep the wallet session active when the popup is closed. Lock it after a period of inactivity.
        </p>

        <form className="mt-3" onSubmit={saveSetting}>
          <div className="custom-control">
            <label className="auto-lock-label text-left mb-1" htmlFor="autoLockMinutes">
              Lock after inactivity (minutes)
            </label>
            <input
              aria-describedby="autoLockHelp autoLockError"
              className={`w-100 custom-label pr-3 ${error ? 'custom-label-error' : ''}`}
              disabled={isLoading || isSaving}
              id="autoLockMinutes"
              max={MAX_AUTO_LOCK_MINUTES}
              min={MIN_AUTO_LOCK_MINUTES}
              name="autoLockMinutes"
              onChange={(event) => {
                setMinutes(event.target.value);
                setError('');
              }}
              step="1"
              type="number"
              value={minutes}
            />
            <div className={`input-error long-error-message ${error ? '' : 'invisible'}`} id="autoLockError" role="alert">
              {error || 'Invalid auto-lock setting'}
            </div>
          </div>

          <p className="text-gray text-left mt-2" id="autoLockHelp">
            Default: {DEFAULT_AUTO_LOCK_MINUTES} minutes. Locking clears the active session, while the encrypted wallet remains stored locally.
          </p>

          <div className="mt-2 d-flex">
            <input
              className="button primary w-100 d-flex justify-content-center text-white"
              disabled={isLoading || isSaving}
              name="submitButton"
              type="submit"
              value={isSaving ? 'Saving...' : 'Save setting'}
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default AutoLock;
