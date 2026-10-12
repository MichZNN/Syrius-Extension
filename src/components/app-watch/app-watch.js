import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Zenon } from 'znn-ts-sdk';

import app from '../../services/utils/app';
import lockWallet from '../../services/wallet/lock';
import vault from '../../services/wallet/vault';
import { getSettings } from '../../services/utils/storage';
import { notify } from '../../services/utils/notify';
import { formatAmount } from '../../services/utils/format';
import { emitChainChange } from '../../services/wallet/chainEvents';
import { resetWalletState } from '../../services/redux/walletSlice';
import { resetPendingTransactions } from '../../services/redux/pendingTransactionsSlice';
import { invalidateAccountCache } from '../../services/hooks/useAccount';

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
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const seen = useRef(null);

  useEffect(() => {
    const native = app();
    if (!native) return undefined;
    return native.onLifecycle(async ({ state, own, away }) => {
      if (state !== 'foreground' || own) return;
      const minutes = getSettings().autoLockMinutes;
      if (away < minutes * 60000) return;
      // As the menu's Lock does (components/burger-popover).
      try {
        await lockWallet();
        invalidateAccountCache();
        dispatch(resetWalletState());
        dispatch(resetPendingTransactions());
        navigate('/password', { replace: true });
      } catch (error) { notify.error(error); }
    });
  }, [dispatch, navigate]);

  useEffect(() => {
    const native = app();
    if (!native) return undefined;
    let stopped = false;
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
      for (const block of fresh) {
        const symbol = block.token?.symbol || '';
        const amount = formatAmount(block.amount, block.token?.decimals ?? 8);
        native.notify({ title: `Incoming ${amount} ${symbol}`.trim(), body: `From ${block.address.toString()}` });
      }
    };
    look();
    const timer = setInterval(look, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return null;
};

export default AppWatch;
