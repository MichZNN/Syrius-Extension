/* global BigInt */

/**
 * Convert user-entered token amounts without floating-point rounding or
 * silently truncating fractional base units before a transaction is signed.
 * The current Zenon SDK API accepts JavaScript numbers, so raw amounts are
 * limited to the exactly representable safe-integer range.
 */
const MAX_SAFE_RAW_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_TOKEN_DECIMALS = 18;
const MAX_AMOUNT_TEXT_LENGTH = 128;

const toDecimalIntegerText = (value) => {
  if (value !== null
    && typeof value === 'object'
    && typeof value.toString === 'function') {
    try {
      const stringValue = value.toString();
      return typeof stringValue === 'string'
        ? toDecimalIntegerText(stringValue)
        : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString() : null;
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }

  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_AMOUNT_TEXT_LENGTH
    || value.trim() !== value
    || !/^\d+$/.test(value)) {
    return null;
  }

  return value;
};

/** Convert a raw token amount to the SDK's exact, safe number representation. */
export const parseSafeRawTokenAmount = (value) => {
  const normalizedValue = toDecimalIntegerText(value);

  if (normalizedValue === null) {
    return null;
  }

  try {
    const amount = BigInt(normalizedValue);
    if (amount <= 0n || amount > MAX_SAFE_RAW_AMOUNT) {
      return null;
    }

    return Number(amount);
  } catch {
    return null;
  }
};

/** Return whether a raw token amount is a positive, SDK-safe integer. */
export const isSafeRawTokenAmount = (value) => (
  parseSafeRawTokenAmount(value) !== null
);

/** Compare a requested raw amount with a node-reported raw token balance. */
export const isSufficientRawTokenBalance = (balance, requestedAmount) => {
  const normalizedBalance = toDecimalIntegerText(balance);
  const normalizedAmount = toDecimalIntegerText(requestedAmount);

  if (normalizedBalance === null
    || normalizedAmount === null
    || !isSafeRawTokenAmount(normalizedAmount)) {
    return false;
  }

  try {
    return BigInt(normalizedBalance) >= BigInt(normalizedAmount);
  } catch {
    return false;
  }
};

/**
 * Parse a human token amount into base units. Exponents, signs, excess
 * precision and values outside the SDK's safe integer range are rejected.
 */
export const parseTokenAmount = (value, decimals) => {
  const normalizedDecimals = Number(decimals);

  if (!Number.isInteger(normalizedDecimals)
    || normalizedDecimals < 0
    || normalizedDecimals > MAX_TOKEN_DECIMALS) {
    return null;
  }

  const amountText = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : value;

  if (typeof amountText !== 'string'
    || amountText.length === 0
    || amountText.length > MAX_AMOUNT_TEXT_LENGTH
    || amountText.trim() !== amountText) {
    return null;
  }

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(amountText);
  if (!match) {
    return null;
  }

  const fraction = match[2] || '';
  if (fraction.length > normalizedDecimals) {
    return null;
  }

  try {
    const scale = 10n ** BigInt(normalizedDecimals);
    const integerPart = BigInt(match[1]) * scale;
    const fractionalPart = fraction.length > 0
      ? BigInt(fraction.padEnd(normalizedDecimals, '0'))
      : 0n;
    const rawAmount = integerPart + fractionalPart;

    if (rawAmount <= 0n || rawAmount > MAX_SAFE_RAW_AMOUNT) {
      return null;
    }

    return Number(rawAmount);
  } catch {
    return null;
  }
};

/** Format raw token units without converting through a floating-point number. */
export const formatTokenAmount = (value, decimals) => {
  const normalizedDecimals = Number(decimals);
  const normalizedValue = toDecimalIntegerText(value);

  if (!Number.isInteger(normalizedDecimals)
    || normalizedDecimals < 0
    || normalizedDecimals > MAX_TOKEN_DECIMALS
    || normalizedValue === null) {
    return null;
  }

  try {
    const rawAmount = BigInt(normalizedValue);
    const scale = 10n ** BigInt(normalizedDecimals);
    const integerPart = rawAmount / scale;

    if (normalizedDecimals === 0) {
      return integerPart.toString();
    }

    const fractionalPart = (rawAmount % scale)
      .toString()
      .padStart(normalizedDecimals, '0')
      .replace(/0+$/, '');

    return fractionalPart.length > 0
      ? `${integerPart.toString()}.${fractionalPart}`
      : integerPart.toString();
  } catch {
    return null;
  }
};
