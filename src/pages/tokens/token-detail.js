import React, { useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import AlertModal from '../../components/modals/alert-modal';
import { Address, Amount } from '../../components/data/data';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import useChainChange from '../../services/hooks/useChainChange';
import { burnError, mintError, reads, templates, updateError } from '../../services/token/token';
import { formatExact, parseAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';

// One token: what it is, and Mint, Burn and Update for its owner. Burn is
// also offered to anyone holding a burnable token.
//
// The token arrives in router state and is read again from the node, so a
// form never acts on a supply or a flag that has since changed.

const actions = [
  { key: 'mint', label: 'Mint' },
  { key: 'burn', label: 'Burn' },
  { key: 'update', label: 'Update' },
];

const TokenDetail = () => {
  const location = useLocation();
  const { address, balances } = useAccount();
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const [token, setToken] = useState(location.state?.token || null);
  const [chosen, setAction] = useState(token?.isMintable ? 'mint' : 'burn');
  const [amount, setAmount] = useState('');
  const [receiver, setReceiver] = useState('');
  const [next, setNext] = useState(null);
  const [touched, setTouched] = useState(false);

  const zts = token?.tokenStandard;
  // Read again when a mint, a burn or an update of this wallet's confirms.
  const [revision, setRevision] = useState(0);
  useChainChange(() => setRevision((count) => count + 1));
  useEffect(() => {
    if (!zts) return undefined;
    let live = true;
    reads.byZts(zts).then((fresh) => live && fresh && setToken(fresh), () => {});
    return () => { live = false; };
  }, [zts, revision]);

  useEffect(() => {
    if (address && !receiver) setReceiver(address);
    if (token && !next) setNext({ owner: token.owner, isMintable: token.isMintable, isBurnable: token.isBurnable });
  }, [address, receiver, token, next]);

  if (!token) return <Navigate to="/tabs/tokens/manage" replace />;

  const isOwner = token.owner === address;
  const held = balances.find((entry) => entry.token?.tokenStandard?.toString() === zts)?.balance || '0';
  const units = parseAmount(amount, token.decimals);
  const shown = actions.filter((entry) => isOwner || entry.key === 'burn');
  // Only Burn is anyone's; an owner's choice falls back to it for others.
  const action = shown.some((entry) => entry.key === chosen) ? chosen : 'burn';

  const errors = {
    mint: mintError(token, units?.toString(), receiver.trim()),
    burn: burnError(token, units?.toString(), held.toString(), address),
    update: next ? updateError(token, { ...next, owner: next.owner.trim() }) : 'Loading…',
  };
  const error = errors[action];

  const send = (template, label, successMessage) => {
    try {
      sendInBackground(template, { successMessage, row: { owner: address, label } });
      setAmount('');
      setTouched(false);
    } catch (err) {
      notify.error(err);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (error) return;
    const amountText = `${formatExact(units, token.decimals)} ${token.symbol}`;
    if (action === 'mint') {
      openModal(
        <AlertModal type="confirm" title={`Mint ${token.symbol}`} confirmLabel="Mint"
          onSuccess={() => send(templates.mint(zts, units.toString(), receiver.trim()), `Minting ${amountText}`, `${amountText} minted`)}>
          <p>Mint <b>{amountText}</b> to <span className="mono">{receiver.trim()}</span>?</p>
        </AlertModal>
      );
    } else if (action === 'burn') {
      openModal(
        <AlertModal type="danger" title={`Burn ${token.symbol}`} confirmLabel="Burn"
          onSuccess={() => send(templates.burn(zts, units.toString()), `Burning ${amountText}`, `${amountText} burned`)}>
          <p>Burn <b>{amountText}</b>? It is gone for good{token.isMintable ? '' : ', and the max supply drops with it'}.</p>
        </AlertModal>
      );
    } else {
      const owner = next.owner.trim();
      openModal(
        <AlertModal type={owner !== token.owner || (!next.isMintable && token.isMintable) ? 'danger' : 'confirm'}
          title={`Update ${token.symbol}`} confirmLabel="Update"
          onSuccess={() => send(templates.update(zts, { ...next, owner }), `Updating ${token.symbol}`, `${token.symbol} updated`)}>
          <dl className="confirm-details">
            {owner !== token.owner && (<><dt>Owner</dt><dd className="mono">{owner}</dd></>)}
            {next.isMintable !== token.isMintable && (<><dt>Mintable</dt><dd>Off, for good</dd></>)}
            {next.isBurnable !== token.isBurnable && (<><dt>Burnable by anyone</dt><dd>{next.isBurnable ? 'On' : 'Off'}</dd></>)}
          </dl>
          {owner !== token.owner && <p>This address loses control of the token.</p>}
        </AlertModal>
      );
    }
  };

  return (
    <div className="page">
      <section className="card">
        <h1 className="pillar-title">{token.name} <span className="data-amount-symbol">{token.symbol}</span></h1>
        <dl className="detail-list is-flush">
          <dt>Id</dt>
          <dd className="mono">{zts}</dd>
          <dt>Supply</dt>
          <dd><Amount value={token.totalSupply} decimals={token.decimals} symbol={token.symbol} /></dd>
          <dt>Max supply</dt>
          <dd><Amount value={token.maxSupply} decimals={token.decimals} symbol={token.symbol} /></dd>
          <dt>Owner</dt>
          <dd><Address value={token.owner} label="Owner" /></dd>
          <dt>Flags</dt>
          <dd>{[token.isMintable && 'Mintable', token.isBurnable && 'Burnable', token.isUtility && 'Utility'].filter(Boolean).join(' · ') || 'None'}</dd>
        </dl>
      </section>

      {shown.length > 1 && (
        <div className="segmented w-100">
          {shown.map((entry) => (
            <button key={entry.key} type="button" aria-pressed={action === entry.key}
              className={`segmented-option ${action === entry.key ? 'is-selected' : ''}`}
              onClick={() => { setAction(entry.key); setTouched(false); }}>
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} noValidate>
        {(action === 'mint' || action === 'burn') && (
          <label className="field">
            <span className="ledger-label">{action === 'burn' ? `Amount, ${formatExact(held, token.decimals)} held` : 'Amount'}</span>
            <input className="custom-label mono" inputMode="decimal" value={amount}
              onChange={(event) => setAmount(event.target.value.trim())} autoComplete="off" />
          </label>
        )}
        {action === 'mint' && (
          <label className="field">
            <span className="ledger-label">To</span>
            <input className="custom-label mono" value={receiver} onChange={(event) => setReceiver(event.target.value)}
              autoComplete="off" spellCheck="false" />
          </label>
        )}
        {action === 'update' && next && (
          <>
            <label className="field">
              <span className="ledger-label">Owner</span>
              <input className="custom-label mono" value={next.owner}
                onChange={(event) => setNext({ ...next, owner: event.target.value })} autoComplete="off" spellCheck="false" />
            </label>
            <label className="setting-row">
              <span className="setting-row-title">Mintable</span>
              <input type="checkbox" className="switch" aria-label="Mintable" checked={next.isMintable}
                disabled={!token.isMintable} onChange={(event) => setNext({ ...next, isMintable: event.target.checked })} />
            </label>
            <label className="setting-row">
              <span className="setting-row-title">Burnable by anyone</span>
              <input type="checkbox" className="switch" aria-label="Burnable by anyone" checked={next.isBurnable}
                onChange={(event) => setNext({ ...next, isBurnable: event.target.checked })} />
            </label>
          </>
        )}

        <span className="input-error">{touched ? error || '' : ''}</span>

        <div className="sticky-actions">
          <button type="submit" className={`button w-100 ${action === 'burn' ? 'danger-text' : 'primary'}`}>
            {actions.find((entry) => entry.key === action)?.label}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TokenDetail;
