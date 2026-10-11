import { useEffect, useState } from 'react';

import { reads } from '../pillar/calls';
import { networkTotals } from '../pillar/apr';

// Every pillar, and what a pillar's delegator rate is measured against: their
// total weight and slots, and the epoch (services/pillar/apr.js). One request for the
// pillar list and two for the epoch, shared by the screens that show a rate
// and kept for a minute; totals over a hundred pillars do not move faster.

const cache = { at: 0, value: null };
const maxAge = 60000;

const load = async () => {
  const [pillars, epoch] = await Promise.all([reads.allPillars(), reads.epoch().catch(() => null)]);
  return { pillars, totals: networkTotals(pillars), epoch };
};

const usePillarEconomy = () => {
  const [economy, setEconomy] = useState(() => (Date.now() - cache.at < maxAge ? cache.value : null));
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (Date.now() - cache.at < maxAge && cache.value) return undefined;
    load()
      .then((value) => {
        cache.at = Date.now();
        cache.value = value;
        if (!cancelled) setEconomy(value);
      })
      // The header already reports a node that is not answering.
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, []);

  return { pillars: null, totals: null, epoch: null, ...economy, error };
};

export default usePillarEconomy;
