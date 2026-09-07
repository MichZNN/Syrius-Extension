import React, { useState } from 'react';

import ChangeNodeItem from '../change-node-item/change-node-item';

// The node list and its add field. Rendered by both the first-run node screen
// and the one in settings, which is why it is a component rather than a third
// copy of the same markup.
const NodeList = ({ nodes, currentNode, onSelect, onRemove, onAdd, isValidNodeUrl, disabled }) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const url = draft.trim();

    if (!isValidNodeUrl(url)) {
      setError('A node URL starts with ws:// or wss://');
      return;
    }
    if (nodes.includes(url)) {
      setError('That node is already in the list');
      return;
    }
    onAdd(url);
    setDraft('');
    setError('');
  };

  return (
    <>
      <div className="node-list">
        {nodes.map((node) => (
          <ChangeNodeItem
            key={node}
            url={node}
            isSelected={currentNode === node}
            onSelect={onSelect}
            onRemove={onRemove}
            disabled={disabled}
          />
        ))}
      </div>

      <form onSubmit={submit}>
        <div className="custom-control">
          <div className="input-with-button w-100">
            <input
              className={`w-100 custom-label pr-3 ${error ? 'custom-label-error' : ''}`}
              placeholder="wss://your-node:35998"
              value={draft}
              spellCheck="false"
              autoComplete="off"
              onChange={(event) => {
                setDraft(event.target.value);
                setError('');
              }}
              type="text"
            />
            <button type="submit" className="input-chip-button">
              Add
            </button>
          </div>
          <div className={`input-error ${error ? '' : 'invisible'}`}>{error || ' '}</div>
        </div>
      </form>
    </>
  );
};

export default NodeList;
