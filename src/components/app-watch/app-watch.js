import { useEffect, useRef } from 'react';
import { Zenon } from 'znn-ts-sdk';

import app from '../../services/utils/app';
import vault from '../../services/wallet/vault';
import { formatAmount } from '../../services/utils/format';
import { emitChainChange } from '../../services/wallet/chainEvents';
import useAppLock from '../../services/hooks/useAppLock';
import { onBlockReceived } from '../../services/wallet/backgroundReceive';

// What the app does while the wallet is unlocked and the person is elsewhere.
// Mounted with the tab screens (layouts/tabsLayout), so only while unlocked;
// renders nothing, and does nothing in the extension.
//
// Locking: the app is never "closed" the way the popup is, so "Lock after"
// counts time spent in the background, and "On close" means leaving the app.
// Trips to the app's own fingerprint prompt, scanner and share sheet do not
// count (platform/nativeFeatures.js).
//
// Incoming: every 20 s the account's unreceived blocks are looked at, and one
// not seen before is a notification while the app is in the background. In the
// foreground Home already shows it. Android keeps the page's timers going for a
// while after the app leaves the screen, not for ever: this is a convenience,
// not a guarantee that every arrival is announced.

const pollMs = 20000;
const shown = 10;

const AppWatch = () => {
  useAppLock();
  const seen = useRef(null);

  useEffect(() => {
    const native = app();
    if (!native) return undefined;
    let stopped = false;
    const announce = (block) => {
      const symbol = block.token?.symbol || '';
      const amount = formatAmount(block.amount, block.token?.decimals ?? 8);
      native.notify({ title: `Incoming ${amount} ${symbol}`.trim(), body: `From ${block.address.toString()}` });
    };
    const look = async () => {
      let page;
      try {
        page = await Zenon.getSingleton().ledger.getUnreceivedBlocksByAddress(await vault.getAddressObject(), 0, shown);
      } catch (error) {
        return; // The next look tries again.
      }
      if (stopped) return;
      const blocks = page?.list || [];
      const first = seen.current === null;
      seen.current = seen.current || new Set();
      const fresh = blocks.filter((block) => !seen.current.has(block.hash.toString()));
      fresh.forEach((block) => seen.current.add(block.hash.toString()));
      // What was waiting at unlock is on Home already.
      if (first || !fresh.length) return;
      emitChainChange('incoming');
      if (!native.inBackground()) return;
      fresh.forEach(announce);
    };
    // A block the background receiver took before this look saw it still
    // gets its notification.
    const stopReceived = onBlockReceived((block) => {
      seen.current = seen.current || new Set();
      if (seen.current.has(block.hash.toString())) return;
      seen.current.add(block.hash.toString());
      if (native.inBackground()) announce(block);
    });
    look();
    const timer = setInterval(look, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
      stopReceived();
    };
  }, []);

  return null;
};

export default AppWatch;
