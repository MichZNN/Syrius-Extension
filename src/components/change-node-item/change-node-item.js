import React from 'react';
import Icon from '../icon/icon';

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
      <Icon name={isSelected ? 'circle-dot' : 'circle'} size={16} className="change-node-radio" />
      <span className="change-node-url">{url}</span>
    </button>

    {!isSelected && (
      <button
        type="button"
        className="icon-button"
        aria-label={`Remove ${url}`}
        onClick={() => onRemove(url)}
      >
        <Icon name="close" size={14} />
      </button>
    )}
  </div>
);

export default ChangeNodeItem;
