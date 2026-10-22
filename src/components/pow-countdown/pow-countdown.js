import React, { useEffect, useState } from 'react';
import { onPowProgress } from '../../services/wallet/powSearch';
import { onHostState } from '../../services/wallet/blockService';

// How much longer proof of work should take, counting down beside "Generating
// plasma". The estimate is the expected time for this device (wallet/powSearch.js);
// a search can run past it, and then this says so rather than going below
// zero. Nothing is shown for one that should take a second or two.

// Short, because it shares a line with the label and the amount: ~12s, ~3m.
const format = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `~${seconds}s` : `~${Math.round(seconds / 60)}m`;
};

const PowCountdown = ({ prefix = ' ' }) => {
  // This page's own proof of work, or the background page's
  // (wallet/blockService.js), which is where it runs while a timed unlock lasts.
  const [own, setOwn] = useState(null);
  const [host, setHost] = useState(null);
  const progress = own || host;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stopOwn = onPowProgress(setOwn);
    const stopHost = onHostState((state) => setHost(state?.pow || null));
    return () => { stopOwn(); stopHost(); };
  }, []);
  useEffect(() => {
    if (!progress) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress]);

  if (!progress?.estimateMs || progress.estimateMs < 2000) return null;
  const left = progress.estimateMs - (now - progress.startedAt);
  return (
    <span className="pow-countdown">
      {prefix}
      {left > 0 ? `${format(left)} left` : 'taking longer'}
    </span>
  );
};

export default PowCountdown;
