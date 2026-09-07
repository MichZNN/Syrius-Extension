import React, { useEffect, useRef, useState } from 'react';

import { truncateAddress } from '../../services/utils/format';
import { copyToClipboard } from '../../services/utils/notify';

// One derived address.
//
// The label is the addition. A wallet's addresses are indistinguishable
// forty-character strings, so the picker was a list of things nobody could tell
// apart — desktop Syrius names them, and this is the same idea kept to one
// editable field.

const ChangeAddressItem = ({ address, index, isSelected, label, onSelect, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(label || '');
  const input = useRef(null);

  useEffect(() => {
    setDraft(label || '');
  }, [label]);

  useEffect(() => {
    if (isEditing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    if (draft.trim() !== (label || '')) {
      onRename(address, draft.trim());
    }
  };

  return (
    <div className={`address-item ${isSelected ? 'is-selected' : ''}`}>
      <button
        type="button"
        className="address-item-main"
        onClick={() => onSelect(index)}
        aria-pressed={isSelected}
      >
        <span className="address-item-radio" aria-hidden="true" />
        <span className="address-item-text">
          {isEditing ? (
            <input
              ref={input}
              className="address-item-label-input"
              value={draft}
              maxLength={24}
              placeholder={`Account ${index + 1}`}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commit();
                }
                if (event.key === 'Escape') {
                  setDraft(label || '');
                  setIsEditing(false);
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="address-item-label">{label || `Account ${index + 1}`}</span>
          )}
          <span className="address-item-address">{truncateAddress(address, 10, 6)}</span>
        </span>
      </button>

      <div className="address-item-actions">
        <button
          type="button"
          className="icon-button"
          title="Rename"
          onClick={() => setIsEditing(true)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M11.5 2.5a1.6 1.6 0 0 1 2.3 2.3l-7.4 7.4-3 .7.7-3 7.4-7.4Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="icon-button"
          title="Copy address"
          onClick={() => copyToClipboard(address, 'Address copied')}
        >
          <img alt="" src={require('./../../assets/copy-icon.png')} width="11" />
        </button>
      </div>
    </div>
  );
};

export default ChangeAddressItem;
