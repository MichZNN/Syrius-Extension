import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Primitives, Zenon, utils as sdkUtils } from 'znn-ts-sdk';

import useAccount from '../../services/hooks/useAccount';
import useBlockSender from '../../services/hooks/useBlockSender';
import vault from '../../services/wallet/vault';
import { sendInternal } from '../../services/utils/messaging';
import {
  formatAmount,
  formatExact,
  toBigNumber,
  truncateAddress,
} from '../../services/utils/format';
import { readableError } from '../../services/utils/errors';
import { notify } from '../../services/utils/notify';

// What a site is asking for, and the choice about it.
//
// The old version was one component holding a three-flow, three-step state
// machine in Redux, with nine nested ternaries in its render and three copies
// of the signing code. It also never showed which site was asking — the whole
// screen said "this website" — so the only way to know what you were approving
// was to remember what you had just clicked. And it indexed
// `balanceInfoMap[tokenStandard]` without a guard, so a request for a token the
// account did not hold threw before the screen drew at all.

const hostOf = (origin) => {
  try {
    return new URL(origin).host;
  } catch (err) {
    return origin || 'Unknown site';
  }
};

const SiteHeader = ({ request }) => (
  <div className="site-header">
    {request.favicon ? (
      <img
        className="site-favicon"
        alt=""
        src={request.favicon}
        width="28"
        height="28"
      />
    ) : (
      <div className="site-favicon site-favicon-blank" />
    )}
    <div className="site-header-text">
      <div className="site-host">{hostOf(request.origin)}</div>
      {/* Many pages title themselves after their own URL, and printing the host
          twice is noise rather than information. */}
      {request.title && request.title !== hostOf(request.origin) && (
        <div className="site-title">{request.title}</div>
      )}
    </div>
  </div>
);

const SiteIntegrationLayout = () => {
  const navigate = useNavigate();
  const { address, isUnlocked } = useSelector((state) => state.wallet);
  const { chainIdentifier, nodeUrl } = useSelector(
    (state) => state.connectionParameters
  );
  const { balanceMap } = useAccount();
  const { send, isSending, isGeneratingPlasma } = useBlockSender();

  const [request, setRequest] = useState(undefined);
  const [preview, setPreview] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  // A locked wallet cannot answer anything. The password screen is told where
  // to come back to so the request is not lost.
  useEffect(() => {
    if (!isUnlocked) {
      navigate('/password', {
        replace: true,
        state: { returnTo: '/site-integration' },
      });
    }
  }, [isUnlocked, navigate]);

  const loadNext = useCallback(async () => {
    try {
      const next = await sendInternal('approvals.next');
      setRequest(next || null);

      // Nothing left to answer means this window was only ever open for the
      // queue, and the queue is empty.
      if (!next) {
        window.close();
      }
      return next;
    } catch (err) {
      setRequest(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      loadNext();
    }
  }, [isUnlocked, loadNext]);

  // For an arbitrary account block, what will actually be signed — with the
  // fields the SDK fills in (chain, height, previous hash) resolved, rather
  // than the bare JSON the page sent.
  useEffect(() => {
    if (!request || request.type !== 'signAndSendBlock') {
      setPreview(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const zenon = Zenon.getSingleton();
        const template = Primitives.AccountBlockTemplate.fromJson(
          request.params
        );
        const keyPair = vault.getKeyPair();
        const filled = await sdkUtils.BlockUtils._checkAndSetFields(
          zenon,
          template,
          keyPair
        );

        if (!cancelled) {
          setPreview(filled.toJson());
        }
      } catch (err) {
        if (!cancelled) {
          // Falling back to what the site sent is better than a blank panel:
          // the point of this screen is that the block is visible before it is
          // signed.
          setPreview(request.params);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request]);

  const finish = async (id, result, grantOrigin = false) => {
    await sendInternal('approvals.resolve', { id, result, grantOrigin });
    await loadNext();
  };

  const reject = async () => {
    if (!request) {
      return;
    }
    await sendInternal('approvals.reject', { id: request.id });
    await loadNext();
  };

  //
  // Connect
  //
  const approveConnect = async () => {
    setIsBusy(true);
    try {
      await finish(request.id, [address], true);
    } finally {
      setIsBusy(false);
    }
  };

  //
  // Send a plain transfer
  //
  const tokenFor = (tokenStandard) => balanceMap[tokenStandard];

  const approveSendTransaction = async () => {
    setIsBusy(true);

    try {
      const { to, tokenStandard, amount } = request.params;
      const template = Primitives.AccountBlockTemplate.send(
        Primitives.Address.parse(to),
        Primitives.TokenStandard.parse(tokenStandard),
        amount
      );
      const signed = await send(template);

      await finish(request.id, {
        hash: signed.hash?.toString(),
        block: signed.toJson?.() ?? null,
      });
      notify.success('Transaction sent');
    } catch (err) {
      notify.error(err);
      await sendInternal('approvals.reject', {
        id: request.id,
        error: { code: -32603, message: readableError(err) },
      });
      await loadNext();
    } finally {
      setIsBusy(false);
    }
  };

  //
  // Sign and send an arbitrary block
  //
  const approveSignAndSend = async () => {
    setIsBusy(true);

    try {
      const template = Primitives.AccountBlockTemplate.fromJson(request.params);
      const signed = await send(template);

      await finish(request.id, {
        hash: signed.hash?.toString(),
        block: signed.toJson?.() ?? null,
      });
      notify.success('Block sent');
    } catch (err) {
      notify.error(err);
      await sendInternal('approvals.reject', {
        id: request.id,
        error: { code: -32603, message: readableError(err) },
      });
      await loadNext();
    } finally {
      setIsBusy(false);
    }
  };

  if (request === undefined) {
    return (
      <div className="page approval-screen">
        <p className="empty-note">Loading request…</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="page approval-screen">
        <p className="empty-note">Nothing to approve.</p>
      </div>
    );
  }

  const busy = isBusy || isSending;
  // The site is blocked on the signed block, so this screen is the one place
  // that still waits — but it waits in place, on its own button, rather than
  // behind a modal that hides what is being approved.
  const busyLabel = isGeneratingPlasma ? 'Generating plasma…' : 'Sending…';

  // A site can ask for more than the account holds, and the wallet used to sign
  // it and let the node do the refusing — after the proof of work. Both request
  // shapes carry the amount and the token the same way, so one check covers a
  // plain transfer and an arbitrary block; a contract call with no value has an
  // amount of zero and never trips it.
  const shortfall = (() => {
    const { tokenStandard, amount } = request.params || {};
    const wanted = toBigNumber(amount);

    if (wanted.isZero()) {
      return null;
    }
    const entry = tokenFor(tokenStandard);

    if (!entry) {
      return 'This account holds none of that token.';
    }
    const balance = toBigNumber(entry.balance);

    if (!wanted.gt(balance)) {
      return null;
    }
    return `This account holds only ${formatAmount(
      balance,
      entry.token?.decimals
    )} ${entry.token?.symbol || ''}.`.trim();
  })();

  return (
    <div className="page approval-screen">
      <SiteHeader request={request} />

      {request.type === 'connect' && (
        <>
          <div className="approval-body">
            <h2 className="approval-title">Connect this wallet?</h2>
            <p className="approval-note">
              {hostOf(request.origin)} will be able to see your address, the
              chain you are signing for and your node URL. It cannot move
              anything without asking again.
            </p>

            <dl className="confirm-details">
              <dt>Address</dt>
              <dd className="word-break-all">{address}</dd>
              <dt>Chain</dt>
              <dd>{chainIdentifier}</dd>
              <dt>Node</dt>
              <dd className="word-break-all">{nodeUrl}</dd>
            </dl>
          </div>

          <div className="action-row sticky-actions">
            <button
              type="button"
              className="button secondary w-100"
              onClick={reject}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary w-100 text-white"
              onClick={approveConnect}
              disabled={busy}
            >
              Connect
            </button>
          </div>
        </>
      )}

      {request.type === 'sendTransaction' && (
        <>
          <div className="approval-body">
            <h2 className="approval-title">Confirm transfer</h2>

            {(() => {
              const { to, tokenStandard, amount } = request.params;
              // Guarded, unlike before: a token this account holds none of is a
              // perfectly ordinary request, not a crash.
              const entry = tokenFor(tokenStandard);
              const decimals = entry?.token?.decimals;
              const symbol = entry?.token?.symbol;

              return (
                <dl className="confirm-details">
                  <dt>Amount</dt>
                  <dd
                    title={
                      decimals !== undefined
                        ? formatExact(amount, decimals)
                        : undefined
                    }
                  >
                    {decimals !== undefined ? (
                      `${formatAmount(amount, decimals)} ${symbol}`
                    ) : (
                      <>
                        {amount?.toString()}{' '}
                        <span className="text-gray">base units</span>
                      </>
                    )}
                  </dd>
                  {decimals === undefined && (
                    <>
                      <dt>Token</dt>
                      <dd className="word-break-all">{tokenStandard}</dd>
                    </>
                  )}
                  <dt>To</dt>
                  <dd className="word-break-all">{to}</dd>
                  <dt>From</dt>
                  <dd title={address}>{truncateAddress(address, 10, 6)}</dd>
                </dl>
              );
            })()}

            {shortfall && (
              <p className="approval-warning" role="alert">
                Not enough balance for this transfer. {shortfall}
              </p>
            )}
          </div>

          <div className="action-row sticky-actions">
            <button
              type="button"
              className="button secondary w-100"
              onClick={reject}
            >
              Reject
            </button>
            <button
              type="button"
              className="button primary w-100 text-white"
              onClick={approveSendTransaction}
              disabled={busy || Boolean(shortfall)}
            >
              {busy ? busyLabel : 'Confirm'}
            </button>
          </div>
        </>
      )}

      {request.type === 'signAndSendBlock' && (
        <>
          <div className="approval-body">
            <h2 className="approval-title">Sign this block?</h2>
            <p className="approval-note">
              This is a raw account block. It can call any contract — read it
              before approving.
            </p>

            <pre className="block-preview">
              {JSON.stringify(preview ?? request.params, null, 2)}
            </pre>

            {shortfall && (
              <p className="approval-warning" role="alert">
                Not enough balance for this block. {shortfall}
              </p>
            )}
          </div>

          <div className="action-row sticky-actions">
            <button
              type="button"
              className="button secondary w-100"
              onClick={reject}
            >
              Reject
            </button>
            <button
              type="button"
              className="button warning w-100"
              onClick={approveSignAndSend}
              disabled={busy || Boolean(shortfall)}
            >
              {busy ? busyLabel : 'Sign and send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SiteIntegrationLayout;
