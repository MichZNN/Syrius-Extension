import { Zenon } from 'znn-ts-sdk';
import vault from './vault';
import session from './session';
import { countPendingBlocks, receivePendingBlocks, receivePhase } from './account';
import { receiveOnce } from './outgoingWatch';
import { getAddressInfo, getSettings } from '../utils/storage';

// Incoming blocks are received while the wallet is unlocked, whether or not
// anyone is looking: every account of the unlocked wallet, checked every 30 s,
// received silently. Auto-receive (Settings) turns it off.
//
// It runs in two kinds of page:
//
// - The wallet's own page (popup, app): its vault is the one the person
//   unlocked, used as it is (`follow: false`).
// - A page of its own (sections/Receiver), opened by the background while a
//   timed unlock lasts, so receiving goes on after the popup closes: Chrome's
//   offscreen document, an iframe in Firefox's background page. It resumes the
//   unlock with `follow: true`, which reads the session without renewing it,
//   so it never keeps the wallet unlocked past "Lock after". On close keeps no
//   key outside the popup, so there is nothing for it to resume.
//
// It only ever signs receive blocks. One pass at a time across all of the
// extension's pages (a Web Lock), and within a page it shares the dashboard's
// receiveOnce, so the same block is not received twice at once.

const pollMs = 30000;
const perAccount = 10;
const lockName = 'syrius.backgroundReceive';

// Each block as it is received: (block, phase, account index), phase as
// account.receivePhase. The background page shows Home what it is receiving
// from this; the app announces arrivals.
const progress = new Set();
export const onReceiving = (listener) => {
  progress.add(listener);
  return () => progress.delete(listener);
};
export const onBlockReceived = (listener) => onReceiving((block, phase, index) => {
  if (phase === receivePhase.done) listener(block, index);
});

export const unlocked = async (follow) => {
  if (!follow) return vault.isUnlocked();
  const record = await session.load();
  if (!record) return false;
  if (vault.isUnlocked() && vault.getLeaseId() === record.id) return true;
  await vault.restore(record, undefined, { renew: false });
  return true;
};

const pass = async (follow) => {
  if (!getSettings().autoReceive || !(await unlocked(follow))) return 0;
  const zenon = Zenon.getSingleton();
  const lifetime = vault.capture();
  const { maxAddressIndex } = getAddressInfo(vault.getWalletName());
  let total = 0;
  for (let index = 0; index < maxAddressIndex && vault.isCurrent(lifetime); index += 1) {
    const address = await vault.getAddressObject(index);
    if (!(await countPendingBlocks(zenon, address))) continue;
    total += await receiveOnce(async () => receivePendingBlocks(zenon, await vault.getSigningKeyPair(index), address, {
      maxBlocks: perAccount,
      onBlock: (block, phase) => progress.forEach((listener) => listener(block, phase, index)),
    }));
  }
  return total;
};

// Starts the loop; returns its stop, with `.now()` to run a pass straight
// away (Home asking). `ready` is the page's own precondition (the receiver
// page connects to the node there).
export const startBackgroundReceive = ({ follow = false, ready = async () => true, onReceived } = {}) => {
  let stopped = false;
  let timer = null;
  // A pass asked for while one runs follows it, rather than running beside it.
  let running = false;
  let again = false;
  const tick = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    try {
      if (await ready()) {
        await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
          if (!lock || stopped) return;
          const count = await pass(follow);
          if (count > 0) onReceived?.(count);
        });
      }
    } catch (error) {
      // A locked wallet, a node that is down: the next pass tries again.
    }
    running = false;
    if (again && !stopped) {
      again = false;
      tick();
      return;
    }
    if (!stopped) timer = setTimeout(tick, pollMs);
  };
  timer = setTimeout(tick, 2000);
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
  };
  stop.now = tick;
  return stop;
};
