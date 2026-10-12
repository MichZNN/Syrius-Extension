import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from '../../../components/icon/icon';
import AlertModal from '../../../components/modals/alert-modal';
import { ModalContext } from '../../../services/hooks/modal/modalContext';
import useAccount from '../../../services/hooks/useAccount';
import useBackgroundSender from '../../../services/hooks/useBackgroundSender';
import { describe } from '../../../services/utils/errors';
import { parseAmount, truncateAddress } from '../../../services/utils/format';
import { notify } from '../../../services/utils/notify';
import vault from '../../../services/wallet/vault';
import { blocksFor, defaultMessage, defaults, findAlien, messageError, messageMax } from '../../../services/zap/zap';

// Zap (Settings): a small gift to a random address that was active this week.
//
// The alien is found as the page opens, by reading the chain, and shown before
// anything is signed; the dice draws another. Amounts and the message start
// from the defaults and can be changed. What "random" and "active" mean, and
// what a zap is on the chain, is in services/zap/zap.js.

// How many of this wallet's own addresses are kept out of the draw.
const ownAddresses = 16;

const Zap = () => {
  const navigate = useNavigate();
  const { address, selectedAddressIndex } = useAccount({ balances: false });
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const [form, setForm] = useState({ znn: defaults.znn, qsr: defaults.qsr, message: defaultMessage });
  const [alien, setAlien] = useState(null);
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState(null);
  const draw = useRef(0);

  const find = useCallback(async () => {
    if (!address) return;
    draw.current += 1;
    const mine = draw.current;
    setFinding(true);
    setProblem(null);
    try {
      const own = await vault.getAddresses(ownAddresses).catch(() => []);
      const found = await findAlien({ exclude: [address, ...own.map(String)] });
      if (mine === draw.current) setAlien(found);
    } catch (error) {
      if (mine === draw.current) {
        setAlien(null);
        setProblem(describe(error).line);
      }
    } finally {
      if (mine === draw.current) setFinding(false);
    }
  }, [address]);

  useEffect(() => {
    find();
    return () => { draw.current += 1; };
  }, [find]);

  const znn = parseAmount(form.znn || '0', 8);
  const qsr = parseAmount(form.qsr || '0', 8);
  const amountsError = !znn || !qsr ? 'Enter amounts as numbers.' : znn.isZero() && qsr.isZero() ? 'Enter an amount of ZNN or QSR.' : null;
  const error = amountsError || messageError(form.message);
  const parts = [znn && !znn.isZero() && `${form.znn} ZNN`, qsr && !qsr.isZero() && `${form.qsr} QSR`].filter(Boolean).join(' and ');

  const send = () => {
    try {
      const blocks = blocksFor({ to: alien.address, amounts: { znn: znn.toString(), qsr: qsr.toString() }, message: form.message });
      sendInBackground(blocks[0].template, {
        addressIndex: selectedAddressIndex,
        successMessage: 'Zapped',
        row: { owner: address, label: 'Zapping', amount: blocks[0].amount, decimals: 8, tokenSymbol: blocks[0].symbol },
        // One job of a block per coin (wallet/blockJobs.js).
        templates: blocks.map((block) => block.template),
        kind: 'zap',
        symbols: blocks.map((block) => block.symbol),
      });
      navigate('/tabs/settings');
    } catch (err) {
      notify.error(err);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (error || !alien || finding) return;
    openModal(
      <AlertModal type="confirm" title="Zap" confirmLabel="Zap" onSuccess={send}>
        <p>
          Send <b>{parts}</b> to <span className="mono" title={alien.address}>{truncateAddress(alien.address)}</span>?
        </p>
      </AlertModal>
    );
  };

  const text = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const used = new TextEncoder().encode(form.message).length;

  return (
    <div className="page">
      <form onSubmit={submit} noValidate>
        <div className="zap-alien">
          <span className="zap-alien-glyph">
            <Icon name="zap" size={20} />
          </span>
          <span className="zap-alien-main">
            <span className="ledger-label">Alien</span>
            {alien && !finding && <span className="mono zap-alien-address" title={alien.address}>{truncateAddress(alien.address)}</span>}
            {finding && <span className="zap-alien-address" role="status">Searching the last 7 days…</span>}
            {!alien && !finding && <span className="zap-alien-address is-note">{problem || 'None found'}</span>}
          </span>
          <button type="button" className="icon-button" onClick={find} disabled={finding} aria-label="Pick another" data-tooltip="Pick another">
            <Icon name="dice" size={18} className={finding ? 'is-rolling' : ''} />
          </button>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="ledger-label">ZNN</span>
            <input className="custom-label mono" inputMode="decimal" value={form.znn} onChange={text('znn')} autoComplete="off" />
          </label>
          <label className="field">
            <span className="ledger-label">QSR</span>
            <input className="custom-label mono" inputMode="decimal" value={form.qsr} onChange={text('qsr')} autoComplete="off" />
          </label>
        </div>

        <label className="field">
          <span className="ledger-label">Message <span className="zap-count mono">{used}/{messageMax}</span></span>
          <textarea className="custom-label zap-message" rows={3} value={form.message} onChange={text('message')} spellCheck="true" />
        </label>

        <span className="input-error">{error || ''}</span>

        <div className="sticky-actions">
          <button type="submit" className="button primary w-100" disabled={Boolean(error) || !alien || finding}>
            Zap
          </button>
        </div>
      </form>
    </div>
  );
};

export default Zap;
