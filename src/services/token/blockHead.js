import { ethers } from 'ethers';
import { sha3_256 } from 'js-sha3';

// Every hashed field of an account block but the nonce, in go-zenon's order
// (chain/nom/account_block.go ComputeHash). The nonce is the last 8 bytes of
// what is hashed, so a search appends it to this. Kept apart from the vault so
// utils/operator-mode-test.js can check it against the SDK's own hash.

const u64 = (value) => ethers.utils.zeroPad(ethers.utils.hexlify(Number(value)), 8);
const bytes = (value) => new Uint8Array(value);

const headOf = (block) =>
  ethers.utils.concat([
    u64(block.version),
    u64(block.chainIdentifier),
    u64(block.blockType),
    bytes(block.previousHash.getBytes()),
    u64(block.height),
    bytes(block.momentumAcknowledged.getBytes()),
    bytes(block.address.getBytes()),
    bytes(block.toAddress.getBytes()),
    ethers.utils.zeroPad(ethers.BigNumber.from(block.amount.toString()).toHexString(), 32),
    bytes(block.tokenStandard.getBytes()),
    bytes(block.fromBlockHash.hash),
    sha3_256.array([]),
    sha3_256.array(bytes(block.data)),
    u64(block.fusedPlasma),
    u64(block.difficulty),
  ]);

export { headOf };
