import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Status } from '../../components/data/data';
import useAccount from '../../services/hooks/useAccount';
import useChainChange from '../../services/hooks/useChainChange';
import { reads } from '../../services/token/token';
import { formatAmount, truncateAddress } from '../../services/utils/format';

// The tokens this address owns, and the way to issue one.

const TokenManage = () => {
  const navigate = useNavigate();
  const { address } = useAccount({ balances: false });
  const [tokens, setTokens] = useState(null);
  const [error, setError] = useState(null);
  // Read again when a block of this wallet's confirms: an issue lands here.
  const [revision, setRevision] = useState(0);
  useChainChange(() => setRevision((count) => count + 1));

  useEffect(() => {
    if (!address) return undefined;
    let live = true;
    reads.owned(address).then(
      (list) => live && setTokens(list),
      (err) => live && setError(err)
    );
    return () => { live = false; };
  }, [address, revision]);

  return (
    <div className="page">
      <div className="token-list">
        {(tokens || []).map((token) => (
          <button
            type="button"
            key={token.tokenStandard}
            className="token-row"
            title={token.tokenStandard}
            onClick={() => navigate('/tabs/tokens/token', { state: { token } })}
          >
            <span className="token-row-main">
              <span className="token-symbol">{token.symbol}</span>
              <span className="token-standard">{truncateAddress(token.tokenStandard, 10, 6)}</span>
            </span>
            <span className="token-row-side">
              <span className="token-balance">{formatAmount(token.totalSupply, token.decimals)}</span>
              {token.isMintable && <Status kind="neutral">Mintable</Status>}
            </span>
          </button>
        ))}
        {tokens && !tokens.length && <p className="empty-note">None yet</p>}
        {!tokens && !error && <p className="empty-note">Loading…</p>}
        {!tokens && error && <p className="empty-note">Could not load</p>}
      </div>

      <div className="sticky-actions">
        <button type="button" className="button primary w-100" onClick={() => navigate('/tabs/tokens/issue')}>
          Issue token
        </button>
      </div>
    </div>
  );
};

export default TokenManage;
