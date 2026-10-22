import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AlertModal from '../../components/modals/alert-modal';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import { decimalsMax, issueError, nameMax, symbolMax, templates } from '../../services/token/token';
import { prepare, publish, search } from '../../services/token/vanity';
import { charset, expectedTries, normalise, patternError, patternMax } from '../../services/token/ztsSearch';
import { parseAmount } from '../../services/utils/format';
import { notify } from '../../services/utils/notify';

// Issuing a token, optionally with an id that starts or ends as asked.
//
// Supplies are typed in whole tokens and sent in base units. A custom id is
// searched for before anything is signed, and shown, so the 1 ZNN fee is paid
// only for the id the user saw. The search runs in this popup: closing it
// ends the search, and nothing has been sent.

const Field = ({ label, error, children }) => (
  <label className="field">
    <span className="ledger-label">{label}</span>
    {children}
    <span className="input-error">{error || ''}</span>
  </label>
);

const Switch = ({ label, checked, onChange, disabled }) => (
  <label className="setting-row">
    <span className="setting-row-title">{label}</span>
    <input type="checkbox" className="switch" aria-label={label} checked={checked} disabled={disabled}
      onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const formatCount = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const formatSeconds = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);

const TokenIssue = () => {
  const navigate = useNavigate();
  const { address } = useAccount({ balances: false });
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const [form, setForm] = useState({
    name: '', symbol: '', domain: '', supply: '', maxSupply: '', decimals: '8',
    isMintable: true, isBurnable: true, isUtility: true, prefix: '', suffix: '',
  });
  const [touched, setTouched] = useState(false);
  // { tried, expected, started } while searching; { zts, ... } once found.
  const [searching, setSearching] = useState(null);
  const [found, setFound] = useState(null);
  const abort = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);

  const set = (key) => (value) => {
    setFound(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  const text = (key) => (event) => set(key)(event.target.value);

  const places = Number(form.decimals);
  const total = parseAmount(form.supply || '0', places);
  const max = form.isMintable ? parseAmount(form.maxSupply, places) : total;
  const values = {
    name: form.name.trim(),
    symbol: form.symbol.trim(),
    domain: form.domain.trim(),
    totalSupply: total ? total.toString() : null,
    maxSupply: max ? max.toString() : null,
    decimals: form.decimals,
    isMintable: form.isMintable,
    isBurnable: form.isBurnable,
    isUtility: form.isUtility,
  };
  const prefix = normalise(form.prefix);
  const suffix = normalise(form.suffix);
  const custom = Boolean(prefix || suffix);
  const error = issueError(values) || (custom ? patternError(prefix, suffix) : null);

  const send = (extra) => {
    try {
      sendInBackground(templates.issue(values), {
        successMessage: `${values.symbol} issued`,
        row: { owner: address, label: `Issuing ${values.symbol}`, amount: '100000000', decimals: 8, tokenSymbol: 'ZNN' },
        ...extra,
      });
      navigate('/tabs/tokens/manage');
    } catch (err) {
      notify.error(err);
    }
  };

  const confirm = (zts, onSuccess) =>
    openModal(
      <AlertModal type="confirm" title={`Issue ${values.symbol}`} confirmLabel="Issue" onSuccess={onSuccess}>
        <p>Issue <b>{values.name}</b> for <b>1 ZNN</b>?</p>
        {zts && <p className="mono">{zts}</p>}
      </AlertModal>
    );

  const startSearch = async () => {
    const controller = new AbortController();
    abort.current = controller;
    const started = Date.now();
    setSearching({ tried: 0, expected: expectedTries(prefix, suffix), started });
    try {
      const prepared = await prepare(templates.issue(values));
      const result = await search({
        head: prepared.head, prefix, suffix, signal: controller.signal,
        onProgress: (tried, expected) => setSearching({ tried, expected, started }),
      });
      setFound({ ...result, prepared });
    } catch (err) {
      if (!controller.signal.aborted) notify.error(err);
    } finally {
      setSearching(null);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (error || searching) return;
    if (!custom) {
      confirm(null, () => send());
      return;
    }
    if (!found) {
      startSearch();
      return;
    }
    const { prepared, nonce, zts } = found;
    confirm(zts, () => send({ send: () => publish(prepared.block, { nonce, zts }, prepared.addressIndex) }));
  };

  const rate = searching && searching.tried ? searching.tried / ((Date.now() - searching.started) / 1000) : 0;
  const shown = touched ? error : null;

  return (
    <div className="page">
      <form onSubmit={submit} noValidate>
        <div className="field-row">
          <Field label="Name">
            <input className="custom-label" value={form.name} onChange={text('name')} maxLength={nameMax}
              autoComplete="off" spellCheck="false" disabled={Boolean(searching)} />
          </Field>
          <Field label="Symbol">
            <input className="custom-label mono" value={form.symbol}
              onChange={(event) => set('symbol')(event.target.value.toUpperCase())} maxLength={symbolMax}
              autoComplete="off" spellCheck="false" disabled={Boolean(searching)} />
          </Field>
        </div>

        <Field label="Domain, optional">
          <input className="custom-label" value={form.domain} onChange={text('domain')} placeholder="zenon.org"
            autoComplete="off" spellCheck="false" disabled={Boolean(searching)} />
        </Field>

        <div className="field-row">
          <Field label="Supply">
            <input className="custom-label mono" inputMode="decimal" value={form.supply} onChange={text('supply')}
              autoComplete="off" disabled={Boolean(searching)} />
          </Field>
          <Field label="Decimals">
            <input className="custom-label mono" inputMode="numeric" value={form.decimals} onChange={text('decimals')}
              maxLength={2} autoComplete="off" disabled={Boolean(searching)} placeholder={`0 to ${decimalsMax}`} />
          </Field>
        </div>

        <Switch label="Mintable" checked={form.isMintable} onChange={set('isMintable')} disabled={Boolean(searching)} />
        {form.isMintable && (
          <Field label="Max supply">
            <input className="custom-label mono" inputMode="decimal" value={form.maxSupply} onChange={text('maxSupply')}
              autoComplete="off" disabled={Boolean(searching)} />
          </Field>
        )}
        <Switch label="Burnable by anyone" checked={form.isBurnable} onChange={set('isBurnable')} disabled={Boolean(searching)} />
        <Switch label="Utility" checked={form.isUtility} onChange={set('isUtility')} disabled={Boolean(searching)} />

        <h3 className="section-title">Custom id</h3>
        <div className="field-row">
          <Field label="Starts with">
            <div className="zts-pattern">
              <span className="mono">zts1</span>
              <input className="custom-label mono" value={form.prefix} onChange={text('prefix')} maxLength={patternMax}
                autoComplete="off" spellCheck="false" disabled={Boolean(searching)} aria-label="Id prefix" />
            </div>
          </Field>
          <Field label="Ends with">
            <input className="custom-label mono" value={form.suffix} onChange={text('suffix')} maxLength={patternMax}
              autoComplete="off" spellCheck="false" disabled={Boolean(searching)} aria-label="Id suffix" />
          </Field>
        </div>
        {custom && !searching && !found && !patternError(prefix, suffix) && (
          <p className="empty-note">About {formatCount(expectedTries(prefix, suffix))} tries. Needs fused plasma.</p>
        )}
        {custom && patternError(prefix, suffix) && !touched && (
          <p className="empty-note">Letters from {charset}</p>
        )}

        {searching && (
          <div className="zts-search" role="status">
            <div className="zts-search-bar">
              <span style={{ width: `${Math.min(100, (searching.tried / searching.expected) * 100)}%` }} />
            </div>
            <span className="mono">
              {formatCount(searching.tried)} tried
              {rate > 0 && ` · about ${formatSeconds(Math.max(0, searching.expected - searching.tried) / rate)} left`}
            </span>
          </div>
        )}
        {found && <p className="zts-found mono">{found.zts}</p>}

        <span className="input-error">{shown || ''}</span>

        <div className="sticky-actions">
          {searching ? (
            <button type="button" className="button secondary w-100" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="button primary w-100">
              {custom && !found ? 'Find id' : 'Issue'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default TokenIssue;
