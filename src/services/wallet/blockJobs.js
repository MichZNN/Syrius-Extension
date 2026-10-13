import { Primitives, Zenon } from 'znn-ts-sdk';

import { fail } from '../utils/errors';
import vault from './vault';
import sendJournaled from './publisher';

// A block job: the blocks one thing the person started is made of, sent in
// order from one account, each in its own turn (journal.js). Most are one
// block; a zap is one per coin, a batch fuse cancel one per fuse. If a later
// block fails after an earlier one landed, the error says so.
//
// Jobs cross between pages as JSON (wallet/blockService.js): templates are
// `toJson()` objects, rebuilt here.
//
//   { kind: 'single' | 'zap' | 'fuses', addressIndex, templates, symbols? }

const template = (value) => (value instanceof Primitives.AccountBlockTemplate
  ? value : Primitives.AccountBlockTemplate.fromJson(value));

// Resolves with the last block sent. `onPow(status)` as the SDK reports it.
const runBlockJob = async (job, { onPow } = {}) => {
  const zenon = Zenon.getSingleton();
  const keyPair = await vault.getSigningKeyPair(job.addressIndex);
  let last = null;
  for (let index = 0; index < job.templates.length; index += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      last = await sendJournaled(zenon, template(job.templates[index]), keyPair, { onPow });
    } catch (error) {
      if (!index) throw error;
      if (job.kind === 'zap') {
        console.warn('[E433]', error);
        throw fail(433, { sent: job.symbols.slice(0, index).join(' and '), failed: job.symbols[index] });
      }
      if (job.kind === 'fuses') {
        console.warn('[E319]', error);
        throw fail(319, { done: index, total: job.templates.length });
      }
      throw error;
    }
  }
  return last;
};

export default runBlockJob;
