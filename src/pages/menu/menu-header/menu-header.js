import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import BurgerIcon from '../../../animated-icons/burger-icon/burger-icon';
import BurgerPopover from '../../../components/burger-popover/burger-popover';
import NavBack from '../../../components/nav-back/nav-back';
import { copyToClipboard } from '../../../services/utils/notify';
import { truncateAddress } from '../../../services/utils/format';
import { getLabel } from '../../../services/utils/storage';
import { mainnetChainId } from '../../../services/utils/chainId';

// The header.
//
// It used to say "ZNN" and nothing else — no address, no network, no way to
// tell a locked wallet from an unlocked one or mainnet from a devnet. That last
// one matters more here than in most wallets, because the chain identifier is
// signed into every block and a mismatch is silently rejected by the node.
//
// What is on it now is what a person needs at a glance and nothing more: which
// account is selected, whether the wallet can reach its node, and the menu.

const MenuHeader = ({ backButton = false, changeNodeButton = false, title = '' }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef(null);

  const { address, isUnlocked } = useSelector((state) => state.wallet);
  const { chainIdentifier, isConnected } = useSelector((state) => state.connectionParameters);

  // A menu that only closes by pressing the same button again is a menu people
  // leave open by accident.
  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  const label = getLabel(address);
  const isOffChain = chainIdentifier !== mainnetChainId;

  return (
    <header className="menu-header">
      <div className="menu-header-left">
        {backButton && <NavBack />}

        {changeNodeButton && (
          <button
            type="button"
            className="icon-button"
            title="Node settings"
            onClick={() => navigate('/initial-node-selection')}
          >
            <img alt="" src={require('./../../../assets/change-network.svg')} width="18" />
          </button>
        )}

        {title && <span className="menu-header-title">{title}</span>}

        {!title && isUnlocked && address && (
          <button
            type="button"
            className="account-pill"
            title="Copy address"
            onClick={() => copyToClipboard(address, 'Address copied')}
          >
            <span className="account-pill-name">{label || 'Account'}</span>
            <span className="account-pill-address">{truncateAddress(address, 4, 4)}</span>
          </button>
        )}
      </div>

      <div className="menu-header-right">
        <div id="pow-spinner-root" />

        {isUnlocked && (
          <button
            type="button"
            className={`network-chip ${isConnected ? 'is-online' : 'is-offline'}`}
            title={
              isConnected
                ? `Connected · chain ${chainIdentifier}`
                : 'Not connected to a node — open node settings'
            }
            onClick={() => navigate('/tabs/settings/change-node')}
          >
            <span className="network-dot" />
            {isOffChain && <span className="network-chain">{chainIdentifier}</span>}
          </button>
        )}

        {isUnlocked && (
          <div className="menu-button-container" ref={menuRef}>
            <button
              type="button"
              className={`icon-button ${isMenuOpen ? 'burger-opened' : ''}`}
              aria-label="Menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <BurgerIcon />
            </button>
            {isMenuOpen && <BurgerPopover onNavigate={() => setIsMenuOpen(false)} />}
          </div>
        )}
      </div>
    </header>
  );
};

export default MenuHeader;
