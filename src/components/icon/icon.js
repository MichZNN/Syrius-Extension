import React from 'react';

import lucide from './lucide';

// One icon set, drawn to one grid, inheriting `currentColor`.
//
// The set is Lucide, as on every other front end in the tree (webdesign-lab
// RULES.md §3). It replaced a hand-drawn 20px set here and, before that, brand
// marks pulled from `src/assets/*.svg` with their colours baked in, so none of
// them could respond to being selected or hovered. The data is vendored in
// `./lucide.js`; names on this side are the wallet's own (`home`, `plasma`,
// `pillar`), so a screen does not depend on what Lucide calls the glyph.
//
// Stroke follows the text beside it: 2 next to semibold labels, which is
// nearly everywhere an icon sits in this popup.

const Icon = ({ name, size = 18, className = '', strokeWidth = 2 }) => {
  const node = lucide[name];

  if (!node) {
    return null;
  }

  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node.map(([Tag, attributes], index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Tag key={index} {...attributes} />
      ))}
    </svg>
  );
};

const iconNames = Object.keys(lucide);

export { iconNames };
export default Icon;
