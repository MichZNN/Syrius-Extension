import { useCallback, useEffect, useRef, useState } from 'react';

import useAccount from './useAccount';
import useChainChange from './useChainChange';
import { reads } from '../pillar/calls';

// What the selected address is to the pillar contract: the pillar it owns, if
// any, and the QSR it has deposited towards registering one.
//
// The three pillar screens each need the first of these and two need the rest,
// so it is read in one place. A failed read leaves `error` set and the last
// good values in place; the header already reports a node that is not
// answering, so the screens only say that the figures could not be loaded.

const usePillar = () => {
  const { address, balanceMap, refresh: refreshAccount } = useAccount();
  const [state, setState] = useState({
    pillar: null, qsrCost: null, qsrDeposited: null, isLoading: true, error: null,
  });
  // A slow answer for an address the user has since switched away from.
  const live = useRef(address);

  const refresh = useCallback(async () => {
    if (!address) return;
    live.current = address;
    try {
      const [pillar, qsrCost, qsrDeposited] = await Promise.all([
        reads.ownedPillar(address),
        reads.qsrCost(),
        reads.depositedQsr(address),
      ]);
      if (live.current !== address) return;
      setState({ pillar, qsrCost, qsrDeposited, isLoading: false, error: null });
    } catch (error) {
      if (live.current !== address) return;
      setState((previous) => ({ ...previous, isLoading: false, error }));
    }
  }, [address]);

  useEffect(() => {
    refresh();
    // Momentums are ten seconds apart; a deposit or a registration sent from
    // here shows up without leaving the screen.
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  // And at once when a block of this wallet's confirms, rather than up to
  // ten seconds later.
  useChainChange(() => refresh());

  return { address, balanceMap, refreshAccount, refresh, ...state };
};

export default usePillar;
