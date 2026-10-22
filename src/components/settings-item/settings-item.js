import React from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from '../icon/icon';

// One row of the settings index: where it goes, and nothing else. It was a
// clickable <div> with a line of description under every title that said the
// title again in more words; it is a button now, so the keyboard reaches it,
// and the description is gone.
// `tone` tints the icon tile with one of the semantic colours.
const SettingsItem = ({ icon, title, url, tone = 'primary' }) => {
  const navigate = useNavigate();

  return (
    <button type="button" className="settings-item" onClick={() => navigate(url)}>
      <span className={`settings-item-icon is-${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="settings-item-title">{title}</span>
      <Icon name="chevron-right" size={16} className="settings-item-chevron" />
    </button>
  );
};

export default SettingsItem;
