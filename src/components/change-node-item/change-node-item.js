import React from 'react';

// One node in the list.
//
// The remove control used to be offered on every row including the selected
// one, so it was possible to delete the node you were connected to and end up
// pointed at something the list no longer knew about.
const ChangeNodeItem = ({ isSelected, onSelect, onRemove, url, disabled }) => (
  <div className={`change-node ${isSelected ? 'is-selected' : ''}`}>
    <button
      type="button"
      className="change-node-main"
      onClick={() => onSelect(url)}
      disabled={disabled}
      title={url}
    >
      <img
        alt=""
        className="change-node-radio"
        src={require(`./../../assets/radio-${isSelected ? 'checked' : 'unchecked'}.svg`)}
      />
      <span className="change-node-url">{url}</span>
    </button>

    {!isSelected && (
      <button
        type="button"
        className="icon-button"
        aria-label={`Remove ${url}`}
        onClick={() => onRemove(url)}
      >
        <img alt="" src={require('./../../assets/close-icon.svg')} width="10" />
      </button>
    )}
  </div>
);

export default ChangeNodeItem;
