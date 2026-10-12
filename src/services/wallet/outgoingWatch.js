import { pendingStatus } from '../redux/pendingTransactionsSlice';
import { sameHistoryNetwork } from './historyObservation';

// Following a sent block to its momentum, from whichever screen is open.
//
// The sender (hooks/useBackgroundSender) stops at "the node accepted it". What
// comes after was Home's alone: seeing the block confirmed, reading the
// balance again, receiving what a contract sends back (a cancelled fuse's QSR,
// a collected reward). Sent from anywhere else, all of that waited until Home
// was opened. This is that follow-up with no screen in it, so the layout can
// run it everywhere (components/outgoing-watch).
//
// Checked in utils/operator-mode-test.js.

// While a block awaits its momentum. Momentums are ten seconds apart.
const pollMs = 3000;
// A contract answers a call some momentums after the call confirms. For this
// long after one of the wallet's own blocks confirms, what arrives is looked
// for; outside it nothing is polled.
const receiveWindowMs = 90000;
const receivePollMs = 5000;
// A block the node accepted and never put in a momentum (a halted chain) is
// not asked about for ever.
const giveUpMs = 10 * 60 * 1000;
// How long the strip says "Confirmed" before it goes.
const confirmedShownMs = 4000;

// The rows the node accepted for this account on this network. Anything else
// in the store (another address, another node, a row with no hash yet) is not
// evidence of a block to look for.
const acceptedRows = (items, address, network) => (items || []).filter((item) =>
  item?.status === pendingStatus.settled && typeof item.hash === 'string' && Boolean(item.hash) &&
  typeof address === 'string' && Boolean(address) && item.owner === address &&
  sameHistoryNetwork(item.network, network));

const isConfirmed = (block) => Boolean(block && block.confirmationDetail);

// Which accepted blocks are still waited for, and when each was confirmed.
// `readBlock(hash)` answers the block, or null when it should not be believed
// (the connection changed while it was asked).
const createTracker = ({ now = Date.now } = {}) => {
  const tracked = new Map();
  const waiting = () => [...tracked.entries()]
    .filter(([, entry]) => entry.confirmedAt === null && now() - entry.since < giveUpMs)
    .map(([hash]) => hash);

  return {
    // True when a row not seen before was taken on.
    add(rows) {
      let added = false;
      for (const row of rows) {
        if (tracked.has(row.hash)) continue;
        tracked.set(row.hash, { id: row.id, since: now(), confirmedAt: null });
        added = true;
      }
      return added;
    },
    waiting,
    // Asks about every block still waited for; answers the ones now confirmed.
    // A read that fails says nothing either way.
    async check(readBlock) {
      const confirmed = [];
      for (const hash of waiting()) {
        let block = null;
        try { block = await readBlock(hash); } catch (error) { block = null; }
        const entry = tracked.get(hash);
        if (!entry || entry.confirmedAt !== null || !isConfirmed(block)) continue;
        entry.confirmedAt = now();
        confirmed.push(hash);
      }
      return confirmed;
    },
    stateOf(hash) {
      const entry = tracked.get(hash);
      if (!entry) return null;
      if (entry.confirmedAt === null) return 'unconfirmed';
      return now() - entry.confirmedAt < confirmedShownMs ? 'confirmed' : 'done';
    },
    windowOpen: () => [...tracked.values()].some((entry) => entry.confirmedAt !== null && now() - entry.confirmedAt < receiveWindowMs),
    clear: () => tracked.clear(),
  };
};

// One line per moving block, newest first, for the strip under the header.
// A failed block is listed with its reason until it is cleared, here or on its
// row on Home: blocks have no toasts (utils/notify.js), so this is where it is
// said away from Home.
const stripRows = (items, address, tracker) => (items || [])
  .filter((item) => !item.owner || item.owner === address)
  .map((item) => {
    if (item.status === pendingStatus.failed) return { id: item.id, label: item.label, state: item.error || 'Failed', failed: true };
    if (item.status === pendingStatus.generatingPlasma) return { id: item.id, label: item.label, state: 'Generating plasma' };
    if (item.status === pendingStatus.sending) return { id: item.id, label: item.label, state: 'Sending' };
    if (item.status !== pendingStatus.settled) return null;
    const state = tracker.stateOf(item.hash);
    if (state === 'unconfirmed') return { id: item.id, label: item.label, state: 'Unconfirmed' };
    if (state === 'confirmed') return { id: item.id, label: item.label, state: 'Confirmed', done: true };
    return null;
  })
  .filter(Boolean);

// One receive at a time across every screen. Home and the watcher can both
// decide to receive the same blocks; the second to ask waits for the first.
let receiving = null;
const receiveOnce = (run) => {
  if (!receiving) {
    receiving = Promise.resolve().then(run).finally(() => { receiving = null; });
  }
  return receiving;
};

export {
  pollMs, receiveWindowMs, receivePollMs, giveUpMs, confirmedShownMs,
  acceptedRows, isConfirmed, createTracker, stripRows, receiveOnce,
};
