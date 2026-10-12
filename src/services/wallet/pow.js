import { Enums, Primitives, utils as sdkUtils } from 'znn-ts-sdk';
import { generatePow } from './powSearch';

// The SDK's own proof of work cannot run in Firefox; the wallet's sends and
// receives pay for their blocks through ./powSearch.js instead.

// The SDK's BlockUtils._setDifficulty, with the proof of work from ./powSearch.js.
export const setDifficulty = async (zenon, block, onPow) => {
  const required = await zenon.embedded.plasma.getRequiredPoWForAccountBlock(
    new Primitives.GetRequiredParam(block.address, block.blockType, block.toAddress, block.data));
  if (required.requiredDifficulty !== 0) {
    block.fusedPlasma = required.availablePlasma;
    block.difficulty = required.requiredDifficulty;
    const hash = await sdkUtils.BlockUtils._getPoWData(block);
    onPow?.(Enums.PowStatus.generating);
    block.nonce = await generatePow(hash.toString(), block.difficulty);
    onPow?.(Enums.PowStatus.done);
  } else {
    block.fusedPlasma = required.basePlasma;
    block.difficulty = 0;
    block.nonce = '0000000000000000';
  }
  return block;
};
