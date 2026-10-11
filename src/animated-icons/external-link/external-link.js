import React from 'react';
import './external-link.scss';

import Icon from '../../components/icon/icon';

// The explorer link's glyph. Lucide's, like every other icon in the wallet;
// the wrapper stays because the rows size the icon through it.
const ExternalLinkIcon = () => (
  <div className="external-link-icon-container">
    <Icon name="external" size={15} />
  </div>
);

export default ExternalLinkIcon;
