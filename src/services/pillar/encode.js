import { ethers } from 'ethers';
import { sha3_256 } from 'js-sha3';

import { signatures } from '../utils/contractCalls';
import { fail } from '../utils/errors';

// Call data for an embedded contract, from the signatures the wallet already
// decodes history with (services/utils/contractCalls.js).
//
// The SDK has encoders for these, but two of them cannot be used: its
// `pillar.depositQsr` sends ZNN, which the contract refuses (DepositQsr takes
// QSR only), and `pillar.register` / `updatePillar` throw when handed the
// Address objects their own types ask for. It has no accelerator API at all.
// Encoding here covers every call the pillar screens make with one path, and
// `utils/pillar-mode-test.js` checks it byte for byte against the SDK where the
// SDK does work.
//
// The layout is go-zenon's ABI, which for these types is Ethereum's: a 4-byte
// selector (SHA3-256 of the signature, not Keccak), then 32-byte words. An
// address is its 20 bytes left-padded; a hash is one word; a token standard is
// its 10 bytes left-padded (`vm/abi/pack.go`), which is a uint80's word.

const abiType = { address: 'address', hash: 'bytes32', tokenStandard: 'uint80' };

const find = (contract, method) => {
  const signature = (signatures[contract] || []).find((entry) => entry.startsWith(`${method}(`));
  if (!signature) throw fail(401, { contract, method });
  return signature;
};

const hex = (value) => (value.startsWith('0x') ? value : `0x${value}`);

// `values` are plain: an address as 20 bytes of hex, a hash as 32, a token
// standard as 10, numbers as numbers or decimal strings.
const encodeCall = (contract, method, values = []) => {
  const signature = find(contract, method);
  const inner = signature.slice(signature.indexOf('(') + 1, -1);
  const types = inner ? inner.split(',') : [];
  if (types.length !== values.length) throw fail(402, { method, count: types.length });

  const encoded = ethers.utils.defaultAbiCoder.encode(
    types.map((type) => abiType[type] || type),
    values.map((value, index) => (abiType[types[index]] ? hex(String(value)) : value))
  );
  return sha3_256(signature).slice(0, 8) + encoded.slice(2);
};

export { encodeCall };
