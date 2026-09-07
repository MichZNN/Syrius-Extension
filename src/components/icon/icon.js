import React from 'react';

// One icon set, drawn to one grid, inheriting `currentColor`.
//
// What this replaces: the tab bar and the transaction rows pulled from
// `src/assets/*.svg`, which are brand marks rather than icons — a blue "QSR"
// wordmark next to a green "ZNN" wordmark next to an isometric 3D block, each
// at its own weight, with its own colour baked in, so none of them could
// respond to being selected or hovered. Half of them were also drawn at a size
// they were never displayed at.
//
// Rendering them as `currentColor` paths is what lets the active tab, a hover
// and a disabled row all just work.

const paths = {
  home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1V9.5Z',
  tokens: 'M10 3.2c3 0 5.4 1 5.4 2.3S13 7.8 10 7.8 4.6 6.8 4.6 5.5 7 3.2 10 3.2ZM4.6 8.2c0 1.3 2.4 2.3 5.4 2.3s5.4-1 5.4-2.3M4.6 11c0 1.3 2.4 2.3 5.4 2.3s5.4-1 5.4-2.3M4.6 5.5v8.3c0 1.3 2.4 2.3 5.4 2.3s5.4-1 5.4-2.3V5.5',
  delegate: 'M10 2.6 16.5 6 10 9.4 3.5 6 10 2.6ZM3.5 10 10 13.4 16.5 10M3.5 13.9 10 17.3l6.5-3.4',
  plasma: 'M11.2 2.5 4.8 11h4l-1 6.5L15.2 9h-4l1-6.5Z',
  stake: 'M10 2.6 16.5 6v8L10 17.4 3.5 14V6L10 2.6ZM3.5 6 10 9.4 16.5 6M10 9.4v8',

  send: 'M4 10h12M11.5 5.5 16 10l-4.5 4.5',
  receive: 'M16 10H4M8.5 5.5 4 10l4.5 4.5',
  contract: 'M6 3.5h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM7.5 7h5M7.5 10h5M7.5 13h3',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
};

// Two of these read better filled than stroked.
const filled = new Set(['home', 'plasma']);

const Icon = ({ name, size = 18, className = '' }) => {
  const path = paths[name];

  if (!path) {
    return null;
  }
  const isFilled = filled.has(name);

  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        stroke={isFilled ? 'none' : 'currentColor'}
        fill={isFilled ? 'currentColor' : 'none'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Icon;
