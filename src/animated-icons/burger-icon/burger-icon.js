import React from 'react';
import './burger-icon.scss';

const BurgerIcon = () => {
  return (
    <div className="burger-icon-container" >
        <div className="menu-icon-dash" id="top"></div>
        <div className="menu-icon-dash" id="middle"></div>
        <div className="menu-icon-dash" id="bottom"></div>
    </div>
  );
};

export default BurgerIcon;
