import React, { useEffect, useState } from 'react';
import { onPowProgress } from '../../services/wallet/powSearch';

// How much longer proof of work should take, counting down beside "Generating
// plasma". The estimate is the expected time for this device (wallet/powSearch.js);
// a search can run past it, and then this says so rather than going below
// zero. Nothing is shown for one that should take a second or two.

const format = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const PowCountdown = ({ prefix = ' ' }) => {
  const [progress, setProgress] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stop = onPowProgress(setProgress);
    return () => { stop(); };
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
      {left > 0 ? `about ${format(left)} left` : 'taking longer than usual'}
    </span>
  );
};

export default PowCountdown;
