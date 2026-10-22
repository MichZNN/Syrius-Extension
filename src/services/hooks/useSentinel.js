import { useCallback, useEffect, useRef, useState } from 'react';

import useAccount from './useAccount';
import useChainChange from './useChainChange';
import { reads } from '../sentinel/sentinel';

// What the selected address is to the sentinel contract: its sentinel, the QSR
// it has deposited towards one, the rewards waiting, and how many sentinels
// are active. Read together and again every momentum, like usePillar.

const useSentinel = () => {
  const { address, balanceMap } = useAccount();
  const [state, setState] = useState({
    sentinel: null, qsrDeposited: null, uncollected: null, activeCount: null, isLoading: true, error: null,
  });
  // A slow answer for an address the user has since switched away from.
  const live = useRef(address);

  const refresh = useCallback(async () => {
    if (!address) return;
    live.current = address;
    try {
      const [sentinel, qsrDeposited, uncollected, activeCount] = await Promise.all([
        reads.owned(address),
        reads.depositedQsr(address),
        reads.uncollected(address),
        reads.activeCount(),
      ]);
      if (live.current !== address) return;
      setState({ sentinel, qsrDeposited, uncollected, activeCount, isLoading: false, error: null });
    } catch (error) {
      if (live.current !== address) return;
      setState((previous) => ({ ...previous, isLoading: false, error }));
    }
  }, [address]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  useChainChange(() => refresh());

  return { address, balanceMap, refresh, ...state };
};

export default useSentinel;
