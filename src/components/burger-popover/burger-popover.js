import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';

import Icon from '../icon/icon';
import lockWallet from '../../services/wallet/lock';
import { notify } from '../../services/utils/notify';
import { getSettings } from '../../services/utils/storage';
import { menuFor } from '../../services/utils/menu';
import { resetWalletState } from '../../services/redux/walletSlice';
import { resetPendingTransactions } from '../../services/redux/pendingTransactionsSlice';
import { invalidateAccountCache } from '../../services/hooks/useAccount';

// The menu behind the header button.
//
// It had a "Help&Support" row that was wired to nothing at all — it looked like
// a control, and pressing it did nothing, which is worse than not being there.
// It also had an "Add wallet" that cleared the background's cached password and
// walked off to the create-wallet flow without locking anything, leaving the
// previous wallet's keys in memory.
//
// In pillar mode the tab bar gives three places to the pillar, and the tabs
// that made room are listed first here (services/utils/menu.js).

const Item = ({ onClick, icon, children }) => (
  <button type="button" className="burger-popover-item" role="menuitem" onClick={onClick}>
    <Icon name={icon} size={16} />
    <span className="ml-2 white-space-nowrap">{children}</span>
  </button>
);

const BurgerPopover = ({ onNavigate = () => {} }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { more } = menuFor(getSettings());

  const go = (path) => {
    onNavigate();
    navigate(path);
  };

  // Leaving this wallet, for the lock screen or for a new wallet, locks it
  // first. "Add wallet" used to clear only the background's password cache and
  // navigate, which left the previous wallet's decrypted keys in memory.
  const lockThen = async (path, options) => {
    onNavigate();
    try {
      await lockWallet();
      invalidateAccountCache();
      dispatch(resetWalletState());
      dispatch(resetPendingTransactions());
      navigate(path, options);
    } catch (error) { notify.error(error); }
  };

  return (
    <div className="burger-popover-container" role="menu">
      {more.map((entry) => (
        <Item key={entry.to} icon={entry.icon} onClick={() => go(`/tabs/${entry.to}`)}>
          {entry.label}
        </Item>
      ))}
      {more.length > 0 && <div className="burger-popover-divider" />}

      <Item icon="wallet" onClick={() => go('/tabs/change-address')}>Change address</Item>
      <Item icon="link" onClick={() => go('/tabs/settings/connected-sites')}>Connected sites</Item>
      <Item icon="settings" onClick={() => go('/tabs/settings')}>Settings</Item>
      <Item icon="plus" onClick={() => lockThen('/auth/onboarding')}>Add wallet</Item>
      <Item icon="lock" onClick={() => lockThen('/password', { replace: true })}>Lock wallet</Item>
    </div>
  );
};

export default BurgerPopover;
