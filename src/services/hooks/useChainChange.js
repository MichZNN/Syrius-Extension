import { useEffect, useRef } from 'react';

import { onChainChange } from '../wallet/chainEvents';

// Runs `callback(kind)` when the chain changed for this wallet
// (services/wallet/chainEvents.js). Subscribed once per mount; the callback is
// read through a ref, so it may close over whatever the screen holds now.
const useChainChange = (callback) => {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => onChainChange((kind) => latest.current(kind)), []);
};

export default useChainChange;
