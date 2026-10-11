import React, { useCallback, useEffect, useState } from 'react';

import { Stat, Status } from '../../../components/data/data';
import {
  behind,
  chainStatus,
  formatAge,
  formatBytes,
  memoryUsedPercent,
  momentumAge,
  read,
  syncStatus,
} from '../../../services/node/stats';
import { formatAmount } from '../../../services/utils/format';

// Node stats (Settings): the chain's pulse first, then the node, then the
// machine it runs on. Read again every ten seconds; the age of the newest
// momentum is counted on this side between reads, so a stopped chain is seen
// growing older rather than sitting at one figure.

const peersShown = 20;
const count = (value) => formatAmount(String(value ?? 0), 0);

const NodeStats = () => {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setStats(await read());
      setFailed(false);
    } catch (error) {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const reads = setInterval(load, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(reads);
      clearInterval(clock);
    };
  }, [load]);

  if (!stats) {
    return <div className="page"><p className="empty-note">{failed ? 'Could not load' : 'Loading…'}</p></div>;
  }

  const { frontier, sync, process, network, os } = stats;
  const age = momentumAge(frontier?.timestamp, now);
  const chain = chainStatus(age);
  const synced = syncStatus(sync?.state);
  const lag = behind(sync);
  const memory = memoryUsedPercent(os);
  const peers = network?.peers || [];

  return (
    <div className="page">
      {failed && <p className="notice is-warning">The node did not answer. These figures may be old.</p>}

      <section className="card">
        <div className="card-head">
          <span className="ledger-label">Chain {frontier?.chainIdentifier}</span>
          <Status kind={chain.kind}>{chain.label}</Status>
        </div>
        <div className="stat-grid is-two">
          <Stat label="Momentum">{count(frontier?.height)}</Stat>
          <Stat label="Newest">{formatAge(age) || 'Unknown'}</Stat>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <span className="ledger-label">Node</span>
          {sync ? <Status kind={synced.kind}>{synced.label}</Status> : <Status kind="neutral">Not shared</Status>}
        </div>
        <dl className="detail-list is-flush">
          <dt>Version</dt>
          <dd className="mono">{process?.version || 'Not shared'}</dd>
          {process?.commit && (
            <>
              <dt>Commit</dt>
              <dd className="mono" title={process.commit}>{process.commit.slice(0, 10)}</dd>
            </>
          )}
          <dt>Behind</dt>
          <dd className="mono">{lag === null ? 'Not shared' : count(lag)}</dd>
          <dt>Peers</dt>
          <dd className="mono">{network ? count(network.numPeers ?? peers.length) : 'Not shared'}</dd>
        </dl>
      </section>

      {os && (
        <section className="card">
          <div className="card-head">
            <span className="ledger-label">Machine</span>
          </div>
          <dl className="detail-list is-flush">
            <dt>System</dt>
            <dd className="mono">{[os.platform || os.os, os.platformVersion].filter(Boolean).join(' ')}</dd>
            <dt>CPUs</dt>
            <dd className="mono">{count(os.numCPU)}</dd>
            <dt>Memory</dt>
            <dd className="mono">
              {formatBytes(Number(os.memoryTotal) - Number(os.memoryFree))} of {formatBytes(os.memoryTotal)}
              {memory !== null && <span className="data-amount-symbol">{memory}%</span>}
            </dd>
            <dt>Goroutines</dt>
            <dd className="mono">{count(os.numGoroutine)}</dd>
          </dl>
        </section>
      )}

      {peers.length > 0 && (
        <>
          <h3 className="section-title">Peers</h3>
          <div className="list">
            {peers.slice(0, peersShown).map((peer) => (
              <div className="list-row" key={peer.publicKey}>
                <div className="list-row-main">
                  <div className="list-row-title">{peer.name || 'Unnamed'}</div>
                  <div className="list-row-note mono" title={peer.publicKey}>{peer.ip}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default NodeStats;
