import React from 'react';

import ExternalLinkIcon from '../../animated-icons/external-link/external-link';

// The explorer, as the small bordered icon the Zenon history rows use, not the
// word "Explorer": it takes a row's last column instead of a line of its own,
// and its tooltip says where it goes. Renders nothing without a URL, so a chain
// with no explorer shows no control rather than a dead one.

const hostOf = (url) => {
  try { return new URL(url).host; } catch (error) { return 'the explorer'; }
};

const ExplorerLink = ({ href, label, small = false }) => {
  if (!href) return null;
  const hint = label || `Open on ${hostOf(href)}`;
  return (
    <a className={`transaction-explorer ${small ? 'is-small' : ''}`} href={href} target="_blank" rel="noreferrer"
      title={hint} aria-label={hint} data-tooltip={hint}>
      <ExternalLinkIcon />
    </a>
  );
};

export default ExplorerLink;
