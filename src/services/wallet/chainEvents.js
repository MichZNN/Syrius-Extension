// What just changed on the chain for this wallet, said once to whoever is on
// screen.
//
// A block sent from Plasma, Stake or a pillar page used to be followed only by
// Home: its row, the balance after it and the receive of whatever the contract
// sent back all waited for Home to be opened again. The layout's watcher
// (components/outgoing-watch) follows it from any screen now and says so here;
// a screen that shows chain data reads it again when it hears.
//
//   'confirmed'  one of this wallet's own blocks is in a momentum
//   'incoming'   blocks are waiting to be received
//   'received'   they were received
//
// Not in Redux: nothing is stored, and a listener that mounts later has
// nothing to catch up on, because it reads fresh on mount anyway.

const listeners = new Set();

const onChainChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const emitChainChange = (kind) => {
  listeners.forEach((listener) => {
    try { listener(kind); } catch (error) { /* One screen cannot keep the others from hearing. */ }
  });
};

export { onChainChange, emitChainChange };
