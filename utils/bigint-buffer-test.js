'use strict';

const assert = require('node:assert/strict');
const {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
} = require('bigint-buffer');

const cases = [
  { value: 0n, width: 1 },
  { value: 1n, width: 1 },
  { value: 255n, width: 1 },
  { value: 256n, width: 2 },
  { value: 0x1234567890abcdefn, width: 8 },
];

for (const { value, width } of cases) {
  assert.equal(toBigIntBE(toBufferBE(value, width)), value);
  assert.equal(toBigIntLE(toBufferLE(value, width)), value);
}

assert.deepEqual(toBufferBE(0x1234n, 2), Buffer.from([0x12, 0x34]));
assert.deepEqual(toBufferLE(0x1234n, 2), Buffer.from([0x34, 0x12]));
assert.throws(() => toBufferBE(0x100n, 1), RangeError);
assert.throws(() => toBufferLE(-1n, 1), RangeError);
assert.throws(() => toBufferBE(1n, 0), RangeError);
assert.throws(() => toBigIntLE(null), TypeError);

console.log('bigint-buffer security checks: pass');
