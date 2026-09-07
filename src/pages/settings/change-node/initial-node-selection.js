import React from 'react';
import { useNavigate } from 'react-router-dom';

import NodeList from '../../../components/node-list/node-list';
import useNodeList from '../../../services/hooks/useNodeList';
import { setCurrentNodeUrl } from '../../../services/utils/storage';
import { loadStorageWalletNames } from '../../../services/utils/utils';

// The first-run node picker. Everything it used to do itself now lives in
// `useNodeList`, which the settings version shares.
const InitialNodeSelection = () => {
  const navigate = useNavigate();
  const nodeList = useNodeList();

  const done = () => {
    // Recording the choice even if the connection never came up: without this
    // the boot check sends the person straight back here, forever, whenever
    // their node happens to be down.
    setCurrentNodeUrl(nodeList.currentNode);
    navigate(loadStorageWalletNames().length ? '/password' : '/auth', { replace: true });
  };

  return (
    <div className="page screen">
      <h1>Choose a node</h1>
      <p className="text-gray text-xs">
        The wallet reads the ledger through this node. Use your own if you have one.
      </p>

      <NodeList
        nodes={nodeList.nodes}
        currentNode={nodeList.currentNode}
        onSelect={nodeList.select}
        onRemove={nodeList.remove}
        onAdd={nodeList.add}
        isValidNodeUrl={nodeList.isValidNodeUrl}
        disabled={nodeList.isConnecting}
      />

      <button type="button" className="button primary w-100 text-white mt-2" onClick={done}>
        Continue
      </button>
    </div>
  );
};

export default InitialNodeSelection;
