import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Primitives, Zenon } from 'znn-ts-sdk';

import AlertModal from '../../components/modals/alert-modal';
import FuseItem from '../../components/fuse-item/fuse-item';
import { ModalContext } from '../../services/hooks/modal/modalContext';
import useAccount from '../../services/hooks/useAccount';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import usePagedList from '../../services/hooks/usePagedList';
import useChainChange from '../../services/hooks/useChainChange';
import { cancelMany, cancellable, picked, prune, selectAll, toggle, totalOf } from '../../services/plasma/batchCancel';
import vault from '../../services/wallet/vault';
import { qsrZts } from '../../services/wallet/account';
import {
  formatAmount,
  formatExact,
  parseAmount,
  toBigNumber,
  toDecimals,
} from '../../services/utils/format';
import { notify } from '../../services/utils/notify';
import Icon from '../../components/icon/icon';
import { fail } from '../../services/utils/errors';

// Plasma.
//
// The fuse form had a bug that made its validation meaningless: the amount
// field's `onChange` called `setValue('toFuseQsrField', qsrAmount)` — the
// balance — instead of the value that had just been typed, so react-hook-form
// validated the maximum against itself and passed whatever was in the box.
// And the fused amount was converted with `parseInt(amount) * 10**8`, which
// drops the decimals off anything fractional without saying so.

const plasmaTiers = [
  { upTo: 10, key: 'no-plasma', icon: 'plasma-none', label: 'No plasma' },
  { upTo: 50, key: 'low-plasma', icon: 'plasma-low', label: 'Low plasma' },
  { upTo: 120, key: 'average-plasma', icon: 'plasma-average', label: 'Average plasma' },
  { upTo: Infinity, key: 'high-plasma', icon: 'plasma-high', label: 'High plasma' },
];

// How many characters of an address fit beside the "Me" chip. A Zenon address
// is 40.
const chipRoom = 30;

const Plasma = () => {
  const { address, balanceMap } = useAccount();
  const { openModal } = useContext(ModalContext);
  const { sendInBackground } = useBackgroundSender();

  const [addressObject, setAddressObject] = useState(null);
  const [amount, setAmount] = useState('');
  // Who the plasma is for — fusing is a gift the contract allows to any
  // address, not only your own. Defaults to this account so the common case
  // (fusing for yourself) needs no typing.
  const [recipient, setRecipient] = useState('');
  const [momentumHeight, setMomentumHeight] = useState(0);
  const [plasmaInfo, setPlasmaInfo] = useState(null);
  const [isPlasmaLoading, setIsPlasmaLoading] = useState(false);

  const qsr = balanceMap[qsrZts];
  const decimals = toDecimals(qsr?.token?.decimals);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset: resetForm,
    setValue,
    trigger,
  } = useForm({ mode: 'onChange' });

  // Filled in once the account's own address is known, and only while the
  // field is still at its untouched default — never overwriting an address
  // someone has already typed in.
  useEffect(() => {
    if (address && !recipient) {
      setRecipient(address);
      setValue('recipientAddressField', address, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    vault
      .getAddressObject()
      .then((object) => !cancelled && setAddressObject(object))
      .catch(() => {});

    Zenon.getSingleton()
      .ledger.getFrontierMomentum()
      .then((momentum) => !cancelled && setMomentumHeight(momentum.height))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!addressObject) {
      setPlasmaInfo(null);
      setIsPlasmaLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPlasmaInfo(null);
    setIsPlasmaLoading(true);

    Zenon.getSingleton()
      .embedded.plasma.get(addressObject)
      .then((info) => {
        if (!cancelled) {
          setPlasmaInfo(info);
        }
      })
      .catch(() => {
        // The paged entries response remains a useful fallback on older nodes.
        if (!cancelled) {
          setPlasmaInfo(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPlasmaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addressObject]);

  const fetchPage = useCallback(
    (page, pageSize) =>
      Zenon.getSingleton().embedded.plasma.getEntriesByAddress(addressObject, page, pageSize),
    [addressObject]
  );

  const entries = usePagedList(fetchPage, { pageSize: 10, enabled: Boolean(addressObject) });

  // A fuse or a cancel confirms while this screen is open: the list and the
  // fused total are read again then, not when the screen is next opened.
  useChainChange(() => {
    entries.refresh();
    if (addressObject) {
      Zenon.getSingleton().embedded.plasma.get(addressObject).then(setPlasmaInfo).catch(() => {});
    }
  });

  // `get` reports the effective plasma for this address, including plasma
  // fused by another wallet for it. The entries endpoint is still used for
  // the detail list and remains the fallback for older nodes.
  const fusedQsr = plasmaInfo?.qsrAmount ?? entries.meta?.qsrAmount;
  const hasEffectivePlasma = toBigNumber(fusedQsr).gt(0);
  const fusedDisplay = formatAmount(fusedQsr, decimals);
  const tier = useMemo(() => {
    const whole = Number(formatAmount(fusedQsr, decimals, { group: false })) || 0;
    return plasmaTiers.find((entry) => whole < entry.upTo) || plasmaTiers[0];
  }, [fusedQsr, decimals]);

  // Through `toBigNumber`, because a balance reaches here as a BigNumber from
  // the node, as the number 0 from the placeholder token map, or as undefined
  // before the first response — and the checks below have to mean the same
  // thing in all three cases.
  const qsrBalance = toBigNumber(qsr?.balance);
  const maxAmount = formatAmount(qsrBalance, decimals, { maxDecimals: decimals, group: false });

  const validateAmount = (input) => {
    const parsed = parseAmount(input, decimals);

    if (parsed === null) {
      return 'Enter a QSR amount';
    }
    // The plasma contract refuses anything under ten QSR.
    if (parsed.lt(parseAmount('10', decimals))) {
      return 'Minimum of 10 QSR';
    }
    // Unconditional. This used to read `qsr?.balance && parsed.gt(…)`, and an
    // account holding no QSR has a balance of literal 0 — which is falsy, so
    // the guard short-circuited and skipped the comparison entirely. The one
    // account that could not afford to fuse anything was the one account whose
    // amount was never checked, and it got as far as a block the node refused.
    if (parsed.gt(qsrBalance)) {
      return qsrBalance.isZero()
        ? 'You have no QSR to fuse'
        : `You only have ${maxAmount} QSR`;
    }
    return true;
  };

  const validateRecipient = (input) => {
    try {
      Primitives.Address.parse((input || '').trim());
      return true;
    } catch (err) {
      return 'That is not a valid Zenon address';
    }
  };

  // Balances arrive a moment after the first render, so an amount typed while
  // the placeholder zero was in place has to be re-checked when the real one
  // shows up — otherwise the error stays on screen after it stops being true,
  // or worse, never appears.
  useEffect(() => {
    if (amount) {
      trigger('toFuseQsrField');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsrBalance.toString()]);

  // Fusing is the one call most likely to need proof of work, because it is
  // what an account with no plasma does about having no plasma. Waiting for it
  // behind a modal was the worst place in the wallet to be stuck.
  const fuse = async () => {
    // Checked again here, not just in the form. The confirmation modal sits
    // between validation and this, and a balance can move underneath it — a
    // pending send landing is enough.
    const problem = validateAmount(amount);

    if (problem !== true) {
      notify.error(fail(110, { text: problem }));
      return;
    }
    if (validateRecipient(recipient) !== true) {
      notify.error(fail(311));
      return;
    }

    try {
      const parsed = parseAmount(amount, decimals);
      const beneficiary = Primitives.Address.parse(recipient.trim());
      const template = await Zenon.getSingleton().embedded.plasma.fuse(beneficiary, parsed);

      sendInBackground(template, {
        successMessage: `Fused ${amount} QSR`,
        row: {
          owner: address,
          label: `Fusing ${amount} QSR`,
          amount: parsed.toString(),
          decimals,
          tokenSymbol: qsr?.token?.symbol || 'QSR',
        },
      });

      setAmount('');
      setRecipient(address);
      resetForm();
    } catch (err) {
      notify.error(err);
    }
  };

  const cancelFuse = async (id) => {
    try {
      const template = await Zenon.getSingleton().embedded.plasma.cancel(id);

      sendInBackground(template, {
        successMessage: 'Fuse cancelled',
        row: { owner: address, label: 'Cancelling fuse' },
      });
    } catch (err) {
      notify.error(err);
    }
  };

  const confirmFuse = () => {
    const trimmedRecipient = recipient.trim();
    const isSelf = trimmedRecipient === address;

    openModal(
      <AlertModal type="confirm" title="Fuse plasma" confirmLabel="Fuse" onSuccess={fuse}>
        <p>
          Fuse <b>{amount} QSR</b> for plasma
          {isSelf ? (
            ' on this address?'
          ) : (
            <>
              {' '}
              for <b className="word-break-all">{trimmedRecipient}</b>?
            </>
          )}
        </p>
      </AlertModal>
    );
  };

  // Several at once. What is selected is kept as ids and read against the
  // list each time, so a fuse that has gone from the list cannot be sent.
  const [selected, setSelected] = useState([]);
  const pickable = cancellable(entries.items, momentumHeight);
  const chosen = picked(entries.items, selected, momentumHeight);
  const chosenTotal = formatAmount(totalOf(chosen), decimals);
  const allPicked = pickable.length > 0 && chosen.length === pickable.length;

  useEffect(() => {
    setSelected((previous) => {
      const next = prune(previous, entries.items, momentumHeight);
      return next.length === previous.length ? previous : next;
    });
  }, [entries.items, momentumHeight]);

  const cancelSelected = () => {
    const list = picked(entries.items, selected, momentumHeight);
    if (!list.length) return;
    try {
      const plasma = Zenon.getSingleton().embedded.plasma;
      const index = vault.getSelectedIndex();
      sendInBackground(null, {
        successMessage: `${list.length} fuses cancelled`,
        row: { owner: address, type: 'plasma', icon: 'plasma', counterpartyName: 'Plasma', label: `Cancelling ${list.length} fuses` },
        send: async () => {
          const keyPair = await vault.getSigningKeyPair(index);
          return cancelMany(list.map((entry) => entry.id), async (id) => Zenon.getSingleton().send(await plasma.cancel(id), keyPair));
        },
      });
      setSelected([]);
    } catch (err) {
      notify.error(err);
    }
  };

  const confirmCancelSelected = () =>
    openModal(
      <AlertModal
        type="warning"
        title={`Cancel ${chosen.length} fuses`}
        confirmLabel="Cancel fuses"
        dismissLabel="Keep"
        onSuccess={cancelSelected}
      >
        <p>
          <b>{chosenTotal} QSR</b> returns to your balance, one block per fuse. This cannot be undone.
        </p>
      </AlertModal>
    );

  const confirmCancel = (id) =>
    openModal(
      <AlertModal
        type="warning"
        title="Cancel fuse"
        confirmLabel="Cancel fuse"
        dismissLabel="Keep"
        onSuccess={() => cancelFuse(id)}
      >
        <p>The QSR returns to your balance. This cannot be undone.</p>
      </AlertModal>
    );

  // The chip sits inside the field while what is typed leaves it room.
  const chipFits = recipient.trim().length <= chipRoom;
  const useOwnAddress = () => {
    setRecipient(address);
    setValue('recipientAddressField', address, { shouldValidate: true });
  };

  return (
    <div className="page">
      <div className="stat-row">
        <div>
          <div className="stat-value" title={formatExact(fusedQsr, decimals)}>
            {fusedDisplay} QSR
          </div>
          <div className="stat-label">Fused</div>
        </div>
        <div className={`status is-${tier.key}`}>
          <Icon name={tier.icon} size={16} />
          {tier.label}
        </div>
      </div>

      <form id="fuseForm" className="fields-only" onSubmit={handleSubmit(confirmFuse)}>
        <div className="custom-control">
          <div className="input-with-button w-100">
            <input
              {...register('toFuseQsrField', { required: true, validate: validateAmount })}
              className={`w-100 custom-label pr-3 ${
                errors.toFuseQsrField ? 'custom-label-error' : ''
              }`}
              placeholder="QSR to fuse"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                // The typed value, not the balance.
                setValue('toFuseQsrField', event.target.value, { shouldValidate: true });
              }}
              inputMode="decimal"
              type="text"
            />
            <button
              type="button"
              className="input-chip-button"
              onClick={() => {
                setAmount(maxAmount);
                setValue('toFuseQsrField', maxAmount, { shouldValidate: true });
              }}
            >
              Max
            </button>
          </div>
          <div className={`input-error ${errors.toFuseQsrField ? '' : 'invisible'}`}>
            {errors.toFuseQsrField?.message || 'Amount is required'}
          </div>
        </div>

        <div className="custom-control">
          {/* A whole address has to be readable here without scrolling the
              field, so it is set in the data face at a size that fits, and
              the "Me" chip gives its room back once the field is nearly
              full. */}
          <div className={`input-with-button w-100 ${chipFits ? '' : 'is-full'}`}>
            <input
              {...register('recipientAddressField', {
                required: true,
                validate: validateRecipient,
              })}
              className={`w-100 custom-label address-input ${
                errors.recipientAddressField ? 'custom-label-error' : ''
              }`}
              placeholder="Recipient address"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setValue('recipientAddressField', event.target.value, { shouldValidate: true });
              }}
              type="text"
              spellCheck="false"
              autoComplete="off"
            />
            {/* Fusing for yourself is the common case; this is the way back to
                it after typing someone else's address. */}
            {chipFits && (
              <button type="button" className="input-chip-button" onClick={useOwnAddress}>
                Me
              </button>
            )}
          </div>
          {!chipFits && recipient.trim() !== address && (
            <button type="button" className="text-link field-link" onClick={useOwnAddress}>
              Use my address
            </button>
          )}
          <div className={`input-error ${errors.recipientAddressField ? '' : 'invisible'}`}>
            {errors.recipientAddressField?.message || 'Address is required'}
          </div>
        </div>
      </form>

      {/* No pending state: confirming leaves this screen immediately and the
          fuse reports itself on the dashboard from there. */}
      <button type="submit" form="fuseForm" className="button blue w-100 text-white">
        Fuse plasma
      </button>

      <div className="list mt-3">
        {pickable.length > 1 && (
          <div className="list-head">
            <span className="ledger-label">Fuses</span>
            <button
              type="button"
              className="text-link"
              onClick={() => setSelected(allPicked ? [] : selectAll(entries.items, momentumHeight))}
            >
              {allPicked ? 'Clear' : 'Select all'}
            </button>
          </div>
        )}

        {entries.items.map((entry) => (
          <FuseItem
            key={entry.id.toString()}
            id={entry.id}
            amount={entry.qsrAmount}
            decimals={decimals}
            beneficiary={entry.beneficiary.toString()}
            expirationHeight={entry.expirationHeight}
            momentumHeight={momentumHeight}
            isRevocable={entry.isRevocable}
            cancelFuse={confirmCancel}
            onSelect={pickable.length > 1 ? (id) => setSelected((previous) => toggle(previous, id)) : undefined}
            selected={selected.includes(entry.id.toString())}
          />
        ))}

        {entries.isEmpty && !isPlasmaLoading && (
          <p className="empty-note">
            {hasEffectivePlasma
              ? 'Plasma is active, but no revocable fusion entry is available here'
              : 'Nothing fused yet'}
          </p>
        )}

        <div ref={entries.sentinelRef} className="load-more-sentinel">
          {entries.showLoading && <span className="text-gray">Loading…</span>}
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="page-footer batch-bar">
          <div className="batch-bar-summary" role="status">
            <span>{chosen.length} selected</span>
            <b>{chosenTotal} QSR</b>
          </div>
          <button type="button" className="thin-button secondary" onClick={() => setSelected([])}>
            Clear
          </button>
          <button type="button" className="thin-button danger-text" onClick={confirmCancelSelected}>
            Cancel fuses
          </button>
        </div>
      )}
    </div>
  );
};

export default Plasma;
