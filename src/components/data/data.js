import React from 'react';

import Icon from '../icon/icon';
import { copyToClipboard } from '../../services/utils/notify';
import { formatAmount, formatExact, truncateAddress } from '../../services/utils/format';

// The data primitives: an address or hash, an amount, a status.
//
// These are what a person opened the wallet to read, so they are never plain
// text: an identifier is mono and shortened as start…end with the whole value
// on hover; an amount is mono with tabular figures; a status is an icon and a
// word, never a colour alone (webdesign-lab RULES.md §1 to §3). New screens go
// through these; the older ones get the same treatment from the stylesheet.

// Press to copy. `full` shows every character, for the place an address is the
// subject of the screen rather than a detail on a row.
const Address = ({ value, lead = 6, tail = 6, full = false, label = 'Address' }) => {
  const text = (value || '').toString();
  if (!text) return null;

  return (
    <button
      type="button"
      className={`data-address ${full ? 'is-full' : ''}`}
      title={full ? `Copy ${label.toLowerCase()}` : text}
      onClick={() => copyToClipboard(text, `${label} copied`)}
    >
      {full ? text : truncateAddress(text, lead, tail)}
    </button>
  );
};

// The amount as shown and exact on hover. The symbol is a label, so it is set
// dimmer than the number it follows.
const Amount = ({ value, decimals = 8, symbol, maxDecimals = 4 }) => (
  <span className="data-amount" title={`${formatExact(value ?? 0, decimals)}${symbol ? ` ${symbol}` : ''}`}>
    {formatAmount(value ?? 0, decimals, { maxDecimals })}
    {symbol && <span className="data-amount-symbol">{symbol}</span>}
  </span>
);

const statusIcons = {
  success: 'circle-check',
  pending: 'clock',
  warning: 'warning',
  error: 'circle-x',
  neutral: 'circle',
};

const Status = ({ kind = 'neutral', children }) => (
  <span className={`status is-${kind}`}>
    <Icon name={statusIcons[kind] || statusIcons.neutral} size={14} />
    {children}
  </span>
);

// A caption over a value: the ledger label and the figure it names.
const Stat = ({ label, children }) => (
  <div className="stat">
    <div className="ledger-label">{label}</div>
    <div className="stat-figure">{children}</div>
  </div>
);

export { Address, Amount, Status, Stat };
