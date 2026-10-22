import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Zenon } from 'znn-ts-sdk';

import pingNode from '../../services/utils/pingNode';
import { getNodeList } from '../../services/utils/storage';
import { replaceWaitingNode, stopWaitingForNode, waitingForNode } from '../../services/wallet/bootstrap';

// What the loading logo and "Unlocking…" turn into when the wallet has been
// waiting on its Zenon node for 3 s (services/wallet/bootstrap.js).
//
// It used to be nothing: the SDK gives up on a dead node after 8 s, and for
// all that time the popup was a logo with no way out, which reads as a wallet
// that will not open. Now it says which node it is waiting for and whether
// that node answers, pings the other nodes it knows, and offers any that
// answer on this wallet's chain — or carrying on without a node, after which
// Settings → Node is reachable as usual.

const STALL_MS = 3000;

const hostOf = (url) => {
  try { return new URL(url).host; } catch (error) { return url; }
};

// What a ping says, in a few words, and whether that node can be used.
const describe = (result, chainIdentifier) => {
  if (!result) return { text: 'Checking…', usable: false };
  if (!result.ok) return { text: `Not answering (${result.error})`, usable: false, bad: true };
  if (result.chainIdentifier !== chainIdentifier) {
    return { text: `Chain ${result.chainIdentifier}; this wallet is on chain ${chainIdentifier}`, usable: false, bad: true };
  }
  return { text: `Answered in ${result.ms} ms · momentum ${result.height.toLocaleString('en-US')}`, usable: true };
};

const NodeStall = () => {
  const dispatch = useDispatch();
  const [waiting, setWaiting] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [pings, setPings] = useState({});
  const [trying, setTrying] = useState(null);
  const [failed, setFailed] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Shown only once the wallet has waited 3 s, and only while it is waiting on
  // a node: a slow start for any other reason has nothing to offer here.
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= STALL_MS) setWaiting(waitingForNode());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const shown = Boolean(waiting);
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    (() => {
      const urls = [...new Set([waitingForNode(), ...getNodeList()].filter(Boolean))];
      setCandidates(urls);
      urls.forEach((url) => pingNode(url).then((result) => {
        if (!cancelled && mounted.current) setPings((previous) => ({ ...previous, [url]: result }));
      }));
    })();
    return () => { cancelled = true; };
  }, [shown]);

  if (!shown) return null;
  const chainIdentifier = Zenon.getChainIdentifier();
  const current = describe(pings[waiting], chainIdentifier);
  const others = candidates.filter((url) => url !== waiting);

  const use = async (url) => {
    setTrying(url);
    setFailed(null);
    const ok = await replaceWaitingNode(dispatch, url);
    if (!mounted.current) return;
    setTrying(null);
    if (ok) return;
    setFailed(url);
    setWaiting(waitingForNode());
  };

  return (
    <section className="node-stall" role="status" aria-live="polite">
      <div className="node-stall-head">
        <span className="node-stall-title">Waiting for the Zenon node</span>
        <span className="node-stall-host" title={waiting}>{hostOf(waiting)}</span>
        <span className={`node-stall-status ${current.bad ? 'is-bad' : ''}`}>{current.text}</span>
      </div>

      {others.length > 0 && (
        <div className="node-stall-list">
          <span className="node-stall-label">Use another node</span>
          {others.map((url) => {
            const state = describe(pings[url], chainIdentifier);
            return (
              <div key={url} className="node-stall-row">
                <span className="node-stall-row-main">
                  <span className="node-stall-host" title={url}>{hostOf(url)}</span>
                  <span className={`node-stall-status ${state.bad ? 'is-bad' : ''}`}>
                    {failed === url ? 'Did not connect' : state.text}
                  </span>
                </span>
                <button type="button" className="button secondary thin-button" disabled={!state.usable || Boolean(trying)} onClick={() => use(url)}>
                  {trying === url ? 'Connecting…' : 'Use'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="text-link node-stall-skip" disabled={Boolean(trying)} onClick={stopWaitingForNode}>
        Continue without a node
      </button>
    </section>
  );
};

export default NodeStall;
