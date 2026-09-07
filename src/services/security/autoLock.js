/**
 * Persistent inactivity setting for the temporary wallet session.
 * Credentials themselves remain in chrome.storage.session and are removed
 * when the session expires or the user locks the wallet.
 */
export const AUTO_LOCK_MINUTES_KEY = 'autoLockMinutes';
export const DEFAULT_AUTO_LOCK_MINUTES = 30;
export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 24 * 60;

export const normalizeAutoLockMinutes = (value) => {
  const minutes = Number(value);

  if (!Number.isInteger(minutes)
    || minutes < MIN_AUTO_LOCK_MINUTES
    || minutes > MAX_AUTO_LOCK_MINUTES) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }

  return minutes;
};

export const isValidAutoLockMinutes = (value) => {
  const minutes = Number(value);

  return Number.isInteger(minutes)
    && minutes >= MIN_AUTO_LOCK_MINUTES
    && minutes <= MAX_AUTO_LOCK_MINUTES;
};

export const getAutoLockMinutes = async () => {
  const result = await chrome.storage.local.get(AUTO_LOCK_MINUTES_KEY);
  return normalizeAutoLockMinutes(result[AUTO_LOCK_MINUTES_KEY]);
};

export const setAutoLockMinutes = async (value) => {
  if (!isValidAutoLockMinutes(value)) {
    throw new Error(`Auto-lock must be between ${MIN_AUTO_LOCK_MINUTES} and ${MAX_AUTO_LOCK_MINUTES} minutes.`);
  }

  const minutes = Number(value);
  await chrome.storage.local.set({
    [AUTO_LOCK_MINUTES_KEY]: minutes,
  });

  return minutes;
};
