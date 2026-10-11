import React from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from '../icon/icon';

// Back, as a button: it was an <img> with a click handler, which the keyboard
// could not reach and a screen reader announced as nothing.
const NavBack = ({ beforeLeave = () => {} }) => {
  const navigate = useNavigate();

  const goBack = async () => {
    await beforeLeave();
    navigate(-1);
  };

  return (
    <button type="button" className="icon-button" aria-label="Back" onClick={goBack}>
      <Icon name="back" size={18} />
    </button>
  );
};

export default NavBack;
