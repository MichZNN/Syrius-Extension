import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Zenon } from 'znn-ts-sdk';

import NodeList from '../../../components/node-list/node-list';
import useNodeList from '../../../services/hooks/useNodeList';
import { storeChainIdentifier } from '../../../services/redux/connectionParametersSlice';
import { detectNodeChainId, mainnetChainId, parseChainId } from '../../../services/utils/chainId';
import { notify } from '../../../services/utils/notify';
import { announceChain, captureLifetime } from '../../../services/wallet/announce';
import { retireReadContext } from '../../../services/wallet/readContext';
import { fail } from '../../../services/utils/errors';
import SettingsItem from '../../../components/settings-item/settings-item';

// Node and chain settings.
//
// The chain identifier is signed into every block, so a wallet pointed at a
// devnet while still signing for mainnet produces blocks the node rejects with
// an error that says nothing about why. The node is asked what chain it is on
// and the mismatch is offered as a one-press fix.

const ChangeNode = () => {
  const dispatch = useDispatch();
  const nodeList = useNodeList();

  const [chainId, setChainId] = useState(() => Zenon.getChainIdentifier());
  const [draftChainId, setDraftChainId] = useState(() => String(Zenon.getChainIdentifier()));
  const [detected, setDetected] = useState({ isDetecting: true, chainId: null });

  const detect = useCallback(async () => {
    setDetected({ isDetecting: true, chainId: null });
    setDetected({ isDetecting: false, chainId: await detectNodeChainId(Zenon.getSingleton()) });
  }, []);

  useEffect(() => {
    detect();
  }, [detect, nodeList.currentNode]);

  // Nothing is reconnected here: the chain identifier is not a property of the
  // connection but of the blocks this wallet signs, and the SDK reads it back
  // from storage for every block it builds.
  const applyChainId = async (value) => {
    const activity = captureLifetime();
    const parsed = parseChainId(value);

    if (parsed === null) {
      notify.error(fail(312));
      return;
    }
    retireReadContext();
    Zenon.setChainIdentifier(parsed);
    setChainId(parsed);
    setDraftChainId(String(parsed));
    dispatch(storeChainIdentifier(parsed));
    await announceChain(activity);

    notify.success(`Signing for chain ${parsed}`);
  };

  const detectedLabel = () => {
    if (detected.isDetecting) {
      return 'Asking the node…';
    }
    if (detected.chainId === null) {
      return 'This node did not report a chain';
    }
    return `This node is on chain ${detected.chainId}`;
  };

  const isMismatched =
    !detected.isDetecting && detected.chainId !== null && detected.chainId !== chainId;

  return (
    <div className="page">
      {/* What the node in use says about itself: reached from here, where the
          node is chosen. */}
      <div className="settings-group">
        <SettingsItem icon="chart" title="Node stats" url="/tabs/settings/node-stats" tone="info" />
      </div>

      <NodeList
        nodes={nodeList.nodes}
        currentNode={nodeList.currentNode}
        onSelect={nodeList.select}
        onRemove={nodeList.remove}
        onAdd={nodeList.add}
        isValidNodeUrl={nodeList.isValidNodeUrl}
        disabled={nodeList.isConnecting}
      />

      {/* Pinned above the tab bar, like Add a token: the node list above it
          can grow, and the chain is what every block is signed for. */}
      <div className="page-footer chain-id-footer">
        <div className="chain-id-line">
          <span>
            <span className="chain-id-current">Signing for chain {chainId}</span>
            <span className="text-gray text-xs"> · {detectedLabel()}</span>
          </span>
          {chainId !== mainnetChainId && (
            <button type="button" className="text-link" onClick={() => applyChainId(mainnetChainId)}>
              Use mainnet
            </button>
          )}
        </div>

        {isMismatched && (
          <div className="chain-id-suggestion">
            <div className="text-xs">
              The node is on chain <b>{detected.chainId}</b>, the wallet signs for <b>{chainId}</b>. Blocks will be
              rejected until they match.
            </div>
            <button
              type="button"
              className="button secondary w-100 mt-2"
              onClick={() => applyChainId(detected.chainId)}
            >
              Use chain {detected.chainId}
            </button>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyChainId(draftChainId);
          }}
        >
          <div className="input-with-button w-100">
            <input
              className="w-100 custom-label pr-3"
              placeholder={`Chain identifier (${mainnetChainId} is mainnet)`}
              aria-label="Chain identifier"
              value={draftChainId}
              onChange={(event) => setDraftChainId(event.target.value)}
              inputMode="numeric"
              type="text"
            />
            <button type="submit" className="input-chip-button">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangeNode;
