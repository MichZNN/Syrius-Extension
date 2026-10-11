import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Primitives } from 'znn-ts-sdk';

import Icon from '../icon/icon';
import useReadContext from '../../services/hooks/useReadContext';
import { invalidateAccountCache } from '../../services/hooks/useAccount';
import vault from '../../services/wallet/vault';
import { countPendingBlocks, receivePendingBlocks } from '../../services/wallet/account';
import { emitChainChange } from '../../services/wallet/chainEvents';
import {
  acceptedRows, createTracker, stripRows, receiveOnce, pollMs, receivePollMs, confirmedShownMs,
} from '../../services/wallet/outgoingWatch';
import { getSettings } from '../../services/utils/storage';
import { notify } from '../../services/utils/notify';

// Follows this wallet's sent blocks to their momentum on every screen under
// the tab layout (services/wallet/outgoingWatch.js has the why and the rules).
//
// It draws one thing, and only away from Home: a line under the header saying
// what is in flight. Home lists the same blocks as rows, so there it draws
// nothing and leaves receiving to Home's own button and progress.

const homePath = '/tabs/dashboard';

const OutgoingWatch = () => {
  const { pathname } = useLocation();
  const address = useSelector((state) => state.wallet.address);
  const items = useSelector((state) => state.pendingTransactions.items);
  const context = useReadContext();
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = createTracker();
  // The tracker is not state; this redraws when what it holds has changed.
  const [, setVersion] = useState(0);
  const redraw = () => setVersion((version) => version + 1);
  const onHome = pathname === homePath;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Another account or another connection: what was being followed belongs to
  // the one before.
  useEffect(() => {
    tracker.current.clear();
    redraw();
  }, [address, context.key]);

  useEffect(() => {
    if (!context.available) return;
    if (tracker.current.add(acceptedRows(items, address, context.network))) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, address, context.key]);

  const isWaiting = context.available && tracker.current.waiting().length > 0;
  useEffect(() => {
    if (!isWaiting) return undefined;
    let cancelled = false;
    // An answer from a connection that has since changed is no answer.
    const readBlock = async (hash) => {
      const block = await context.zenon.ledger.getBlockByHash(Primitives.Hash.parse(hash));
      return context.isCurrent() ? block : null;
    };
    const check = async () => {
      const confirmed = await tracker.current.check(readBlock);
      if (cancelled || !confirmed.length) return;
      // The balance on screen is now stale by definition, on any screen.
      invalidateAccountCache();
      emitChainChange('confirmed');
      redraw();
      // "Confirmed" is shown for a moment and then goes. Not tied to this
      // effect: confirming the last block is what ends it.
      setTimeout(() => mounted.current && redraw(), confirmedShownMs + 50);
    };
    check();
    const timer = setInterval(check, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, context.key]);

  // After one of this wallet's blocks confirms, what it brings back is looked
  // for. Home is told and decides for itself; elsewhere it is received here,
  // when auto-receive is on.
  const windowOpen = context.available && tracker.current.windowOpen();
  const home = useRef(onHome);
  home.current = onHome;
  useEffect(() => {
    if (!windowOpen) return undefined;
    let cancelled = false;
    const look = async () => {
      if (!tracker.current.windowOpen()) {
        if (!cancelled) redraw();
        return;
      }
      let addressObject = null;
      let count = 0;
      try {
        addressObject = await vault.getAddressObject();
        count = await countPendingBlocks(context.zenon, addressObject);
      } catch (error) {
        // A look that fails is tried again on the next one.
        return;
      }
      if (cancelled || !context.isCurrent() || !count) return;
      emitChainChange('incoming');
      if (home.current || !getSettings().autoReceive) return;
      try {
        const received = await receiveOnce(async () =>
          receivePendingBlocks(context.zenon, await vault.getSigningKeyPair(), addressObject));
        if (received > 0) {
          notify.success(`Received ${received} transaction${received === 1 ? '' : 's'}`);
          invalidateAccountCache();
          emitChainChange('received');
        }
      } catch (error) {
        notify.error(error);
      }
    };
    look();
    const timer = setInterval(look, receivePollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowOpen, context.key]);

  if (onHome) return null;
  const rows = stripRows(items, address, tracker.current);
  if (!rows.length) return null;
  const [first, ...rest] = rows;

  return (
    <div className={`outgoing-strip ${first.done ? 'is-done' : ''}`} role="status">
      <Icon name={first.done ? 'circle-check' : 'loader'} size={14} className={first.done ? '' : 'spinner'} />
      <span className="outgoing-strip-label">{first.label}</span>
      <span className="outgoing-strip-state">{first.state}</span>
      {rest.length > 0 && <span className="outgoing-strip-more">+{rest.length}</span>}
    </div>
  );
};

export default OutgoingWatch;
