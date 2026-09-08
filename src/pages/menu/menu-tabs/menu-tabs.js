import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import Icon from '../../../components/icon/icon';

// The bottom navigation.
//
// Two things were wrong with it. The active tab was component state set on
// click, so it had no idea about the browser back button, a redirect or a deep
// link — going back from Send left the indicator on whichever tab was pressed
// last. And every tap ran `setTimeout(() => navigate(tab), 300)`, so the wallet
// answered a quarter of a second late by construction; that delay existed to
// let an indicator animation finish, which the animation can do on its own.
//
// The location is the source of truth now, and navigation happens on press.

const tabs = [
  { to: 'dashboard', label: 'Home', icon: 'home' },
  { to: 'tokens', label: 'Tokens', icon: 'tokens' },
  { to: 'delegate', label: 'Delegate', icon: 'delegate' },
  { to: 'plasma', label: 'Plasma', icon: 'plasma' },
  { to: 'stake', label: 'Stake', icon: 'stake' },
];

// These destinations are siblings below /tabs. A relative "to=tokens" is
// resolved from the current leaf (/tabs/dashboard) and becomes
// /tabs/dashboard/tokens, which is not one of the wallet routes.
const MenuTabs = () => {
  const location = useLocation();

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => location.pathname.includes(`/tabs/${tab.to}`))
  );

  return (
    <nav className="tab-menu">
      <div className="active-tab-container">
        <div
          className="active-tab-indicator"
          style={{ left: `${(activeIndex * 100) / tabs.length}%`, width: `${100 / tabs.length}%` }}
        />
      </div>
      <div className="d-flex justify-content-around w-100">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={'/tabs/' + tab.to}
            className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
          >
            <Icon name={tab.icon} className="tab-item-icon" />
            <span className="tab-item-text">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MenuTabs;
