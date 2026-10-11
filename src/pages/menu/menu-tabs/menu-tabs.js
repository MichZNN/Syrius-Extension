import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import Icon from '../../../components/icon/icon';
import { getSettings } from '../../../services/utils/storage';
import { menuFor } from '../../../services/utils/menu';

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
//
// Which tabs there are is decided in services/utils/menu.js, by pillar mode.
// The setting is read on render; this bar is unmounted while Settings is
// open, so it never shows a stale answer.

// These destinations are siblings below /tabs. A relative "to=tokens" is
// resolved from the current leaf (/tabs/dashboard) and becomes
// /tabs/dashboard/tokens, which is not one of the wallet routes.
const MenuTabs = () => {
  const location = useLocation();
  const { tabs } = menuFor(getSettings());

  // -1 on a screen reached from the header menu: no tab is the current one,
  // and the indicator steps aside rather than pointing at Home.
  const activeIndex = tabs.findIndex((tab) => location.pathname.startsWith(`/tabs/${tab.to}`));

  return (
    <nav className="tab-menu">
      <div className="active-tab-container">
        {activeIndex >= 0 && (
          <div
            className="active-tab-indicator"
            style={{ left: `${(activeIndex * 100) / tabs.length}%`, width: `${100 / tabs.length}%` }}
          />
        )}
      </div>
      <div className="tab-menu-items">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={'/tabs/' + tab.to}
            className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
          >
            <span className="tab-item-glyph">
              <Icon name={tab.icon} className="tab-item-icon" />
            </span>
            <span className="tab-item-text">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MenuTabs;
