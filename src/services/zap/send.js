import { Zenon } from 'znn-ts-sdk';

import { fail } from '../utils/errors';
import vault from '../wallet/vault';

// Sends the blocks one after the other from one account. The second waits for
// the first because each block names the one before it. If the first lands and
// the second does not, the error says which coin went.
const sendZap = async (blocks, addressIndex = vault.getSelectedIndex()) => {
  const zenon = Zenon.getSingleton();
  const keyPair = await vault.getSigningKeyPair(addressIndex);
  const sent = [];
  let last = null;
  for (const block of blocks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      last = await zenon.send(block.template, keyPair);
      sent.push(block.symbol);
    } catch (error) {
      if (!sent.length) throw error;
      console.warn('[E433]', error);
      throw fail(433, { sent: sent.join(' and '), failed: block.symbol });
    }
  }
  return last;
};

export { sendZap };
export default sendZap;
