import { Primitives } from 'znn-ts-sdk';
import { ethers } from 'ethers';
import fallbackValues from '../utils/fallbackValues';
import { parseAmount, toBigNumber } from '../utils/format';
import { fail } from '../utils/errors';

const znnZts = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const qsrZts = 'zts1qsrxxxxxxxxxxxxxmrhjll';

const nativeTokens = Object.freeze(
  Object.fromEntries(
    Object.entries(fallbackValues.availableTokens).map(([zts, entry]) => [
      zts,
      Object.freeze({ ...entry.token }),
    ])
  )
);

const normalizeTokenStandard = (value) =>
  Primitives.TokenStandard.parse(value?.toString()).toString();

// Use the SDK's integer parser for both approval text and construction. In
// particular, hexadecimal amounts are valid base units, not display errors.
const normalizeBaseUnits = (value) => {
  const amount = ethers.BigNumber.from(value);
  if (amount.lt(0)) {
    throw fail(316);
  }
  return amount.toString();
};

// A node response cannot authenticate a custom token's decimal scale. Such
// tokens remain sendable in exact integer base units, with their full identity.
const authorizationMetadata = (tokenStandard) => {
  const zts = normalizeTokenStandard(tokenStandard);
  const native = nativeTokens[zts];
  return Object.freeze({
    tokenStandard: zts,
    decimals: native ? native.decimals : 0,
    symbol: native ? native.symbol : 'base units',
    isNative: Boolean(native),
  });
};

// How a token is labelled on screen, like the Tokens tab and the activity
// list: a custom token takes the symbol and decimals from the node's token
// data. What is signed never reads these; the amount and the confirmation use
// authorizationMetadata, which knows only ZNN and QSR.
const displayMetadata = (token) => {
  const metadata = authorizationMetadata(token.tokenStandard);
  if (metadata.isNative) return { symbol: metadata.symbol, decimals: metadata.decimals };
  const { symbol, decimals } = token;
  return {
    symbol: typeof symbol === 'string' && symbol.trim() ? symbol : 'Custom token',
    decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : 0,
  };
};

const parseTransferAmount = (input, tokenStandard) => {
  const metadata = authorizationMetadata(tokenStandard);
  const text = typeof input === 'string' ? input.trim() : '';
  if (!metadata.isNative && !/^\d+$/.test(text)) {
    return null;
  }
  return parseAmount(text, metadata.decimals);
};

// Primitive copies bind the confirmation and constructor to the same units
// and identity. RPC metadata is never retained in an authorization snapshot.
const prepareTransfer = ({ tokenStandard, amount, recipient, owner, balance }) => {
  const metadata = authorizationMetadata(tokenStandard);
  const parsed = parseTransferAmount(amount, tokenStandard);
  if (!parsed || parsed.lte(0)) {
    throw fail(metadata.isNative ? 317 : 318);
  }
  if (parsed.gt(toBigNumber(balance))) {
    throw fail(309);
  }
  return Object.freeze({
    ...metadata,
    amount: parsed.toString(),
    recipient: Primitives.Address.parse(recipient.trim()).toString(),
    owner,
  });
};

export { normalizeBaseUnits, znnZts, qsrZts, nativeTokens, normalizeTokenStandard, authorizationMetadata, displayMetadata, parseTransferAmount, prepareTransfer };
