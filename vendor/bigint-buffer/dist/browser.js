'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const assertBigInt = (value) => {
  if (typeof value !== 'bigint') {
    throw new TypeError('Expected a BigInt value.');
  }
  if (value < 0n) {
    throw new RangeError('Negative BigInt values are not supported.');
  }
};

const assertWidth = (width) => {
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError('Buffer width must be a non-negative safe integer.');
  }
};

const assertFits = (value, width) => {
  if (width === 0) {
    if (value !== 0n) {
      throw new RangeError('BigInt value does not fit in the requested width.');
    }
    return;
  }

  if (value >= 1n << BigInt(width * 8)) {
    throw new RangeError('BigInt value does not fit in the requested width.');
  }
};

const toBigIntLE = (value) => {
  const reversed = Buffer.from(value);
  reversed.reverse();
  const hex = reversed.toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
};

const toBigIntBE = (value) => {
  const hex = Buffer.from(value).toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
};

const toBuffer = (value, width, littleEndian) => {
  assertBigInt(value);
  assertWidth(width);
  assertFits(value, width);

  const hex = value.toString(16).padStart(width * 2, '0');
  const buffer = Buffer.from(hex, 'hex');
  if (littleEndian) {
    buffer.reverse();
  }
  return buffer;
};

exports.toBigIntLE = toBigIntLE;
exports.toBigIntBE = toBigIntBE;
exports.toBufferLE = (value, width) => toBuffer(value, width, true);
exports.toBufferBE = (value, width) => toBuffer(value, width, false);
