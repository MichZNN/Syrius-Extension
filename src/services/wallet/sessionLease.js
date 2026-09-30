// Shared by extension pages and the service worker. Keep this module SDK-free.
//
// One record under `znn.unlock` is the wallet's shared authority. Its identity
// (`id`) is what every live key handle is bound to; its lock policy (`minutes`,
// and `privateUntil` for an On close owner) lives in the record too, so a
// renewal computes its deadline from the policy current under the lock rather
// than from a preference some caller read before the policy changed.
const sessionKey = 'znn.unlock';
const publicStateKey = 'znn.publicState';
const lockName = 'znn.walletSession';
// Records written before policy moved into the record carry no `minutes` and
// are not live: they require one password unlock after this update.
const version = 1;
const lockChoices = [0, 5, 15, 60];
const ended = () => Object.assign(new Error('The wallet session ended. Unlock it again.'), { code: 'WALLET_LOCKED' });
const unavailable = () => Object.assign(new Error('Could not confirm the wallet session. Other wallet windows may still be unlocked. Try again or close the browser.'), {
  code: 'WALLET_SESSION_UNAVAILABLE',
});
const storage = async (method, value) => {
  try { return await chrome.storage.session[method](value); }
  catch (error) { throw unavailable(); }
};
const transaction = (operation) => navigator.locks.request(lockName, async () =>
  operation(await storage('get', [sessionKey, publicStateKey])));
const identity = (record) => record?.id ?? null;
// `expected` is a lease id, or `{id, revision}` to also require that no policy
// change has happened since it was read. Cleanup after a failed restore uses
// the second form: a record its owner has since switched to On close keeps its
// id, and must not be revoked by a window that merely failed to resume it.
const matchesExpected = (record, expected) => (expected && typeof expected === 'object'
  ? identity(record) === expected.id && record?.revision === expected.revision
  : identity(record) === expected);
const validMinutes = (minutes) => lockChoices.includes(minutes);
const live = (record) => Boolean(record?.id && record.version === version && record.walletName &&
  validMinutes(record.minutes) && (
    record.mode === 'local' ? record.ownerId && (!record.privateUntil || Date.now() < record.privateUntil) :
      record.mode === 'timed' && record.entropy && Number.isFinite(record.expiresAt) && Date.now() < record.expiresAt
  ));
const allowed = (record, id, ownerId) => live(record) && record.id === id &&
  (record.mode !== 'local' || record.ownerId === ownerId);
const revoke = async () => {
  const id = crypto.randomUUID();
  // Keep a non-secret generation after clearing. An in-flight unlock that
  // began before lock must not mistake an empty store for its original state.
  await storage('set', { [sessionKey]: { id, locked: true }, [publicStateKey]: null });
  return id;
};
// A deadline that has passed is revoked by whoever notices: a timed record's
// entropy, or an On close owner's staged finite deadline.
const lapsed = (record) => Boolean(record && !record.locked && !live(record) &&
  (record.mode === 'timed' || (record.mode === 'local' && record.privateUntil)));
const assertLease = async (record, id, ownerId) => {
  if (!allowed(record, id, ownerId)) {
    if (record?.id === id && lapsed(record)) await revoke();
    throw ended();
  }
};
// On close has no resumable key material outside its owning document. A
// staged `privateUntil` bounds that owner while a policy change is pending.
const recordFrom = ({ id, revision, walletName, entropy, selectedAddressIndex, ownerId, minutes, privateUntil }) => {
  if (!walletName || !entropy || !ownerId || !validMinutes(minutes)) throw ended();
  const timed = minutes > 0;
  return {
    version, id, revision: revision || crypto.randomUUID(), walletName, selectedAddressIndex, ownerId, minutes,
    mode: timed ? 'timed' : 'local',
    lastActiveAt: Date.now(),
    expiresAt: timed ? Date.now() + minutes * 60000 : 0,
    ...(timed ? { entropy } : privateUntil ? { privateUntil } : {}),
  };
};
const begin = () => transaction((stored) => identity(stored[sessionKey]));
const create = (expectedId, values, adopt) => transaction(async (stored) => {
  if (identity(stored[sessionKey]) !== expectedId) throw ended();
  // The preference is read inside the lock, so a policy change that committed
  // while the password was being checked is the one this session starts under.
  const record = recordFrom({ ...values, minutes: values.minutes(), id: crypto.randomUUID() });
  await storage('set', { [sessionKey]: record, [publicStateKey]: null });
  try { return await adopt(record); }
  catch (error) { await revoke(); throw error; }
});
const use = (id, ownerId, operation) => transaction(async (stored) => {
  const record = stored[sessionKey];
  await assertLease(record, id, ownerId);
  const result = await operation(record);
  // Includes time spent in async crypto. Never release a result after expiry.
  await assertLease(record, id, ownerId);
  return result;
});
// Activity and restore renew under the record's own policy. A caller that
// captured an older preference cannot extend the session past the current one.
const renew = (id, values, operation) => transaction(async (stored) => {
  const current = stored[sessionKey];
  await assertLease(current, id, values.ownerId);
  if ((values.walletName && values.walletName !== current.walletName) ||
      (values.resumable && current.mode !== 'timed')) throw ended();
  const record = recordFrom({
    ...current, id, ownerId: values.ownerId,
    selectedAddressIndex: values.selectedAddressIndex ?? current.selectedAddressIndex,
    entropy: values.entropy || current.entropy,
  });
  await storage('set', { [sessionKey]: record });
  return operation(record, current.entropy);
});
// Applies a changed lock duration to the running session.
//
// A shorter duration clamps the deadline without extending time already left.
// Anything that relaxes authority — a longer duration, leaving On close for a
// timed duration, or entering On close from a finite deadline — is staged: the
// stricter intersection is written first, the preference is saved, and only
// then is the relaxed record written. A failure at any step leaves the session
// no less strict than both the old and the new policy.
const setPolicy = (id, ownerId, minutes, entropy, persist) => transaction(async (stored) => {
  if (!validMinutes(minutes)) throw new Error('Choose a supported lock duration.');
  const current = stored[sessionKey];
  await assertLease(current, id, ownerId);
  const now = Date.now();
  const previousDeadline = current.mode === 'timed' ? current.expiresAt : current.privateUntil || 0;
  const timed = minutes > 0;
  const deadline = timed ? Math.min(previousDeadline || Infinity, now + minutes * 60000) : 0;
  const { entropy: _entropy, privateUntil: _privateUntil, ...kept } = current;
  // Every policy write gets a new revision; see matchesExpected.
  const next = { ...kept, revision: crypto.randomUUID(), ownerId, minutes, mode: timed ? 'timed' : 'local',
    expiresAt: deadline, ...(timed ? { entropy } : {}) };
  const removesDeadline = !timed && Boolean(previousDeadline);
  const relaxing = removesDeadline || (timed && (current.mode === 'local' || minutes > current.minutes));
  const stage = removesDeadline ? { ...next, privateUntil: previousDeadline } :
    current.mode === 'local' && timed ? { ...kept, revision: crypto.randomUUID(), ownerId, privateUntil: deadline } :
      relaxing ? null : next;
  // Public wallet state is never readable under On close, so leaving timed
  // withdraws it in the same commit.
  const write = (record) => storage('set', { [sessionKey]: record,
    ...(record.mode === 'local' ? { [publicStateKey]: null } : {}) });
  if (stage) await write(stage);
  const settings = persist();
  if (relaxing) await write(next);
  return { record: relaxing ? next : stage, settings };
});
const load = () => transaction(async (stored) => {
  const record = stored[sessionKey];
  if (!record || record.locked || record.mode === 'local') return null;
  if (!live(record)) { await revoke(); return null; }
  return record;
});
const clear = (expected) => transaction((stored) =>
  expected !== undefined && !matchesExpected(stored[sessionKey], expected) ? null : revoke());
// Only a timed session advertises public state. The worker cannot tell whether
// an On close owner is still open, so it never answers a site out of one.
const publish = (id, ownerId, value) => use(id, ownerId, async (record) => {
  if (record.mode !== 'timed') return false;
  await storage('set', { [publicStateKey]: { ...value, leaseId: id } });
  return true;
});
const getPublicState = (expectedId) => transaction((stored) => {
  const record = stored[sessionKey];
  const value = stored[publicStateKey];
  if (!live(record) || record.mode !== 'timed' ||
      (expectedId !== undefined && record.id !== expectedId) || value?.leaseId !== record.id) return null;
  return value;
});
// The worker's view of one lease identity, for delivering an event about it:
// its public state when timed, `{hidden: true}` for a live On close session
// (sites are told there is no account), or null when it is no longer current.
const eventState = (expectedId) => transaction((stored) => {
  const record = stored[sessionKey];
  const value = stored[publicStateKey];
  if (!live(record) || record.id !== expectedId) return null;
  if (record.mode !== 'timed') return { hidden: true };
  return value?.leaseId === record.id ? value : null;
});
const isLockedGeneration = (id) => transaction((stored) =>
  identity(stored[sessionKey]) === id && !stored[publicStateKey]);
const expire = () => transaction(async (stored) => {
  const record = stored[sessionKey];
  if (!record || record.locked) return null;
  if (lapsed(record)) return revoke();
  if (record.mode === 'local') {
    // An open On close owner keeps its private lifetime; it never has public
    // state, and a leftover snapshot from before the change is withdrawn.
    if (!stored[publicStateKey]) return null;
    await storage('set', { [publicStateKey]: null });
    return record.id;
  }
  return null;
});

const sessionLease = {
  sessionKey, publicStateKey, lockChoices, validMinutes, ended, unavailable, live, begin, create, use, renew, setPolicy,
  load, clear, publish, getPublicState, eventState, isLockedGeneration, expire,
};
export default sessionLease;
