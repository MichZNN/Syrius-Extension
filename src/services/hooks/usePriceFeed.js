import { useEffect, useRef, useState } from 'react';

import { fetchTokenPrices } from '../utils/tokenPrice';

// How often to ask CoinGecko while a screen that shows a dollar value is
// open — often enough that a price feels live, comfortably inside
// CoinGecko's public rate limit.
const pollIntervalMs = 60000;

// Live ZNN/QSR USD prices, polled only while `enabled`. They are mainnet's
// prices: a devnet or a private chain has no coin of its own, so a screen
// that shows one beside a test balance says it is mainnet's price.
const usePriceFeed = (enabled) => {
  const [prices, setPrices] = useState({ znn: null, qsr: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPrices({ znn: null, qsr: null });
      return undefined;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await fetchTokenPrices();

        if (!cancelled && mounted.current) {
          setPrices(next);
        }
      } catch (err) {
        // A quiet tick is better than a wallet that throws over a price feed.
        // Whatever was last fetched stays on screen rather than blanking out.
      }
    };

    poll();
    const timer = setInterval(poll, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return prices;
};

export default usePriceFeed;
