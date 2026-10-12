import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { Enums, Zenon } from 'znn-ts-sdk';

import vault from '../wallet/vault';
import { captureHistoryNetwork } from '../wallet/historyObservation';
import sendJournaled from '../wallet/publisher';
import { invalidateAccountCache } from './useAccount';
import { readableError } from '../utils/errors';
import { describeOutgoingTemplate } from '../utils/outgoingBlock';
import {
  pendingStatus,
  startPendingTransaction,
  updatePendingTransaction,
} from '../redux/pendingTransactionsSlice';

// Sending a block without holding the screen hostage.
//
// `useBlockSender` awaits the whole thing, which is right only for the dApp
// approval flow — the site is blocked on the signed block, so there is nothing
// else for that screen to do. It is wrong for anything the user started
// themselves: generating proof of work takes seconds, and the wallet used to
// spend them as a dark rectangle with a modal spinner over it. There was no
// balance, no history, no way back, and closing the popup to escape killed the
// very work it was waiting on.
//
// This registers the block in the store, starts the work, and returns straight
// away. The caller navigates home; the dashboard reads the store and reports
// progress there.
//
// The work still lives in the popup's JavaScript context, so closing the popup
// window still ends it. Surviving that needs the block to be signed in the
// service worker, which is a larger change than this one.

const useBackgroundSender = () => {
  const dispatch = useDispatch();

  const sendInBackground = useCallback(
    // `send`, when given, replaces the SDK's fill-in-and-send: a block that
    // was filled in and searched ahead (services/token/vanity.js) is signed
    // as it is. A caller's `successMessage` is no longer shown: blocks report
    // on their row and the strip, not in toasts.
    (template, { row, addressIndex, send } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const owner = row?.owner;
      const zenon = Zenon.getSingleton();
      const historyContext = captureHistoryNetwork(zenon);

      // The glyph, the type and the contract's name come off the template, so a
      // call site only supplies what it alone knows — the wording, the amount
      // and which account it is from. It also means an in-flight fuse looks
      // exactly like the fuse it becomes once it is in the history.
      dispatch(
        startPendingTransaction({
          id,
          status: pendingStatus.sending,
          ...describeOutgoingTemplate(template),
          ...row,
          network: historyContext.network,
        })
      );

      // Deliberately not awaited. The floating promise is the point: the caller
      // returns to the dashboard while this runs.
      (async () => {
        try {
          const keyPair = send ? null : await vault.getSigningKeyPair(addressIndex);

          // Recorded before it is sent, and under this account's turn: see
          // wallet/journal.js. A caller's own `send` takes its turns itself
          // (zap, batch cancel, a searched token id).
          const signed = send ? await send() : await sendJournaled(zenon, template, keyPair, { onPow: (status) => {
            // `PowStatus.generating` is 0, so this has to compare rather than
            // test for truth — the obvious `if (status)` reads it as "done".
            if (status === Enums.PowStatus.generating) {
              dispatch(
                updatePendingTransaction({ id, status: pendingStatus.generatingPlasma })
              );
            }
            if (status === Enums.PowStatus.done) {
              dispatch(updatePendingTransaction({ id, status: pendingStatus.sending }));
            }
          } });

          // The balance on screen is now stale by definition.
          invalidateAccountCache();
          dispatch(
            updatePendingTransaction({
              id,
              status: pendingStatus.settled,
              hash: signed?.hash?.toString(),
              // If the mutable SDK context moved during send, do not guess
              // which endpoint accepted the block or clear its row by default.
              network: historyContext.isCurrent() && signed?.chainIdentifier === historyContext.network.chainIdentifier &&
                signed?.address?.toString() === owner ? historyContext.network : null,
            })
          );

        } catch (err) {
          // No toast for block work: the row on Home and the strip above the
          // tab bar (components/outgoing-watch) say what happened and keep
          // saying it until it is dismissed.
          dispatch(
            updatePendingTransaction({
              id,
              status: pendingStatus.failed,
              error: readableError(err),
            })
          );
        }
      })();

      return id;
    },
    [dispatch]
  );

  return { sendInBackground };
};

export default useBackgroundSender;
