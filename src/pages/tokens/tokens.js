import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAccount from '../../services/hooks/useAccount';
import { formatAmount, formatExact, truncateAddress } from '../../services/utils/format';

// Every ZTS this account holds.
//
// Parity gap, not a nicety: the wallet only ever knew about two tokens. Its
// balance map was seeded from a hard-coded ZNN/QSR pair and every screen read
// through that, so a ZTS someone had been sent was invisible — the balance was
// on the ledger and there was no screen in the extension that would show it,
// nor any way to send it on. Desktop Syrius has had a token list from the
// start.

const Tokens = () => {
  const navigate = useNavigate();
  const { balances, isLoading } = useAccount();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return balances;
    }
    return balances.filter((entry) => {
      const token = entry.token || {};
      return (
        (token.symbol || '').toLowerCase().includes(needle) ||
        (token.name || '').toLowerCase().includes(needle) ||
        (token.tokenStandard?.toString() || '').toLowerCase().includes(needle)
      );
    });
  }, [balances, query]);

  return (
    <div className="page">
      {/* The search field only earns its place once the list is long enough to
          need one. */}
      {balances.length > 6 && (
        <input
          className="custom-label w-100"
          placeholder="Search tokens"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="text"
        />
      )}

      <div className="token-list">
        {filtered.map((entry) => {
          const token = entry.token || {};
          const zts = token.tokenStandard?.toString() || '';
          // The name is only worth a line when it says something the symbol
          // does not; on this ledger they are often the same string.
          const secondary =
            token.name && token.name !== token.symbol ? token.name : truncateAddress(zts, 10, 6);

          return (
            <button
              type="button"
              key={zts}
              className="token-row"
              title={zts}
              onClick={() =>
                navigate('/tabs/dashboard/send', { state: { currentSelectedToken: zts } })
              }
            >
              <span className="token-row-main">
                <span className="token-symbol">{token.symbol || '?'}</span>
                <span className="token-standard">{secondary}</span>
              </span>

              <span className="token-balance" title={formatExact(entry.balance, token.decimals)}>
                {formatAmount(entry.balance, token.decimals)}
              </span>
            </button>
          );
        })}

        {!filtered.length && (
          <p className="empty-note">{isLoading ? 'Loading…' : 'No tokens match that'}</p>
        )}
      </div>
    </div>
  );
};

export default Tokens;
