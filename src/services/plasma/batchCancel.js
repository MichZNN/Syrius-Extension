import { ethers } from 'ethers';

import { fail } from '../utils/errors';

// Cancelling several fuses at once.
//
// The plasma contract cancels one fusion per call, so a batch is that many
// blocks from one account, sent one after another: each names the block
// before it. Cancelling also takes away the plasma that would have paid for
// the next block, so later ones may need proof of work and the whole batch can
// take a while. If one fails, the ones before it have already been cancelled
// and the error says how many.
//
// Which fuses can be picked is the same rule the row's own Cancel button
// follows: past its expiration height, and revocable by this account (an entry
// fused by another wallet for this address is neither).
//
// Checked in utils/operator-mode-test.js.

const keyOf = (id) => String(id);

// Unknown height counts as unlocked, as the row has always treated it: the
// contract refuses a cancel that is early, so nothing is lost by offering it.
const isCancellable = (entry, momentumHeight) => {
  if (!entry || entry.isRevocable === false) return false;
  const height = Number(momentumHeight);
  return !height || Number(entry.expirationHeight) - height <= 0;
};

const cancellable = (entries, momentumHeight) => (entries || []).filter((entry) => isCancellable(entry, momentumHeight));

// Selections are arrays of id strings, in the order the list shows them.
const toggle = (selected, id) => {
  const key = keyOf(id);
  return selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
};

const selectAll = (entries, momentumHeight) => cancellable(entries, momentumHeight).map((entry) => keyOf(entry.id));

// What is still selectable of a selection, after the list reloaded: a fuse
// cancelled elsewhere, or one that is no longer in the list, drops out.
const prune = (selected, entries, momentumHeight) => {
  const still = new Set(selectAll(entries, momentumHeight));
  return selected.filter((key) => still.has(key));
};

// The selected entries, in list order, never one twice.
const picked = (entries, selected, momentumHeight) => {
  const wanted = new Set(selected);
  const seen = new Set();
  return cancellable(entries, momentumHeight).filter((entry) => {
    const key = keyOf(entry.id);
    if (!wanted.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// QSR the selection returns, in base units.
const totalOf = (entries) => entries.reduce((sum, entry) => sum.add(ethers.BigNumber.from(entry.qsrAmount.toString())), ethers.BigNumber.from(0));

// Cancels `ids` in order through `sendOne(id)`, which sends one CancelFuse
// block and resolves once the node has it. Resolves with the last block.
const cancelMany = async (ids, sendOne) => {
  if (!ids.length) throw fail(320);
  let done = 0;
  let last = null;
  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      last = await sendOne(id);
      done += 1;
    } catch (error) {
      if (!done) throw error;
      console.warn('[E319]', error);
      throw fail(319, { done, total: ids.length });
    }
  }
  return last;
};

export { isCancellable, cancellable, toggle, selectAll, prune, picked, totalOf, cancelMany };
