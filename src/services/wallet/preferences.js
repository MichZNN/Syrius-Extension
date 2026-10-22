import { setSetting } from '../utils/storage';
import { announceAddress } from './announce';
import lease from './sessionLease';
import vault from './vault';
import { fail } from '../utils/errors';

// Saving a setting. Every setting throws when it cannot be saved, so a screen
// never shows a choice that did not stick.
//
// The lock duration is also the running session's policy, so an unlocked
// wallet applies it to its lease in the same step (vault.setLockPolicy). Sites
// are then told what they may now see: nothing under On close.
const modeKeys = ['pillarMode', 'sentinelMode', 'sporkMode'];

const updateSetting = async (key, value) => {
  // A switch is on or off and a theme is one of three; anything else stored
  // here would be read back as a mode nobody chose.
  if (modeKeys.includes(key) && typeof value !== 'boolean') throw fail(208);
  if (key === 'theme' && !['dark', 'light', 'system'].includes(value)) throw fail(209);
  if (key !== 'autoLockMinutes') return setSetting(key, value);
  if (!lease.validMinutes(value)) throw fail(207);
  if (!vault.isUnlocked()) return setSetting(key, value);
  try {
    return await vault.setLockPolicy(value);
  } finally {
    await announceAddress();
  }
};

export { updateSetting };
