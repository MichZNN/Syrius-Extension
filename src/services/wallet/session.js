import { getSettings, setAddressInfo, setSetting } from '../utils/storage';
import lease from './sessionLease';
import { sameScope } from './walletScope';
import { fail } from '../utils/errors';

// The owner token never leaves this document except in its trusted session
// marker. Other documents receive fresh tokens and cannot resume On close.
const ownerId = crypto.randomUUID();
// Read when the lease is created, under its lock, not when the caller started.
const preferredMinutes = () => {
  const minutes = getSettings().autoLockMinutes;
  return lease.validMinutes(minutes) ? minutes : 15;
};
// Failure to read is not evidence that the shared wallet is locked.
const load = () => lease.load();
// Both explicit lock and startup recovery must observe a committed revocation.
// Keep the expected identity (a lease id, or `{id, revision}`) on every retry
// so recovery cannot clear a newer password unlock in another document.
// Only storage unavailability is retried; an `afterRevoke` failure is its own.
const clear = async (expected, afterRevoke) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await lease.clear(expected, afterRevoke); }
    catch (error) {
      if (error.code !== 'WALLET_SESSION_UNAVAILABLE') throw error;
      if (attempt === 1) {
        throw Object.assign(fail(204), {
          code: 'WALLET_LOCK_FAILED',
        });
      }
    }
  }
};
const create = (expectedId, values, adopt) => lease.create(expectedId, { ...values, ownerId, minutes: preferredMinutes }, adopt);
const restore = (record, scope, adopt) => lease.renew(record.id, {
  ownerId, walletName: record.walletName, scope, resumable: true,
}, (current, entropy) => adopt(current, entropy));
// The background receiver's resume: the same checks as `restore`, but nothing
// is written. A page nobody is looking at must not keep the wallet unlocked
// past "Lock after", or take over the record's owner.
const follow = (record, scope, adopt) => lease.use(record.id, ownerId, (current) => {
  if (current.walletName !== record.walletName || current.mode !== 'timed' ||
      !sameScope(scope, current.scope)) throw Object.assign(fail(201), { code: 'WALLET_LOCKED' });
  return adopt(current, current.entropy);
});
const use = (id, operation, check) => lease.use(id, ownerId, operation, check);
const touch = (id, values, operation) => lease.renew(id, { ...values, ownerId }, operation);
const publish = (id, publicState) => lease.publish(id, ownerId, publicState);
// The wallet's saved selection is written inside the same transaction, first.
const select = (id, choice, walletName, maxAddressIndex) => lease.select(id, ownerId, choice, () => {
  if (!setAddressInfo(walletName, { selectedAddressIndex: choice.index, maxAddressIndex })) {
    throw fail(205);
  }
});
// The preference is saved between the stricter stage and the relaxed record;
// see sessionLease.setPolicy. `setSetting` throws when it cannot save.
const setPolicy = (id, minutes, entropy) => lease.setPolicy(id, ownerId, minutes, entropy,
  () => setSetting('autoLockMinutes', minutes));
const session = {
  sessionKey: lease.sessionKey, publicStateKey: lease.publicStateKey,
  ended: lease.ended, changed: lease.changed, begin: lease.begin, create, restore, follow, use, touch, select, load,
  clear, publish, setPolicy, isLockedGeneration: lease.isLockedGeneration,
};
export default session;
