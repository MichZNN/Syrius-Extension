import { Enums, Primitives, Zenon } from 'znn-ts-sdk';

import runBlockJob from '../../services/wallet/blockJobs';
import { unlocked, onReceiving } from '../../services/wallet/backgroundReceive';
import { receivePhase } from '../../services/wallet/account';
import { onPowProgress } from '../../services/wallet/powSearch';
import { captureHistoryNetwork } from '../../services/wallet/historyObservation';
import { describeOutgoingTemplate, describePendingBlock } from '../../services/utils/outgoingBlock';
import { readableError } from '../../services/utils/errors';
import { pendingStatus } from '../../services/redux/pendingTransactionsSlice';
import { channel, stateChannel, heartbeatMs } from '../../services/wallet/blockService';

// The block service: every send and receive the wallet makes while a timed
// unlock lasts, proof of work included, runs here and not in the popup, so
// closing the popup stops none of it (wallet/blockService.js is the popup's
// side). What is under way is kept here and told to every extension page:
//
// - `jobs`: rows in the shape of the popup's pending transactions
//   (redux/pendingTransactionsSlice), kept until the popup has seen one
//   settle into its history or the person dismisses a failure, so a popup
//   opened later shows them where it left them.
// - `receiving`: the incoming block being received now, Home's row for it.
// - `pow`: the proof of work under way, for the countdown.
// - `received`: a count that moves when blocks have come in.

const settledKeepMs = 15 * 60 * 1000;
const failedKeepMs = 2 * 60 * 60 * 1000;

const state = { jobs: [], receiving: null, pow: null, received: 0 };

const prune = () => {
  const now = Date.now();
  state.jobs = state.jobs.filter((job) => !(
    (job.status === pendingStatus.settled && now - job.endedAt > settledKeepMs) ||
    (job.status === pendingStatus.failed && now - job.endedAt > failedKeepMs)));
};
const broadcast = () => {
  prune();
  chrome.runtime.sendMessage({ channel: stateChannel, state }).catch(() => {});
};
const update = (id, changes) => {
  const job = state.jobs.find((entry) => entry.id === id);
  if (job) Object.assign(job, changes);
  broadcast();
};

// Proof of work, sends and receives alike.
onPowProgress((progress) => {
  state.pow = progress;
  broadcast();
});

onReceiving((block, phase, index) => {
  state.receiving = phase === receivePhase.done ? null : {
    ...describePendingBlock(block),
    hash: block.hash?.toString(),
    // The account it is coming in to: Home shows it on that account only.
    owner: block.toAddress?.toString(),
    accountIndex: index,
    isGeneratingPlasma: phase === receivePhase.generatingPlasma,
  };
  if (phase === receivePhase.done) state.received += 1;
  broadcast();
});

const run = async (job) => {
  const zenon = Zenon.getSingleton();
  const history = captureHistoryNetwork(zenon);
  update(job.id, { network: history.network });
  try {
    const signed = await runBlockJob(job, {
      onPow: (status) => update(job.id, {
        status: status === Enums.PowStatus.generating ? pendingStatus.generatingPlasma : pendingStatus.sending,
      }),
    });
    update(job.id, {
      status: pendingStatus.settled,
      hash: signed?.hash?.toString(),
      endedAt: Date.now(),
      // As the popup's sender did: if the node or chain moved during the
      // send, do not guess which one took the block.
      network: history.isCurrent() && signed?.chainIdentifier === history.network.chainIdentifier &&
        signed?.address?.toString() === job.row?.owner ? history.network : null,
    });
  } catch (error) {
    update(job.id, { status: pendingStatus.failed, error: readableError(error), endedAt: Date.now() });
  }
};

// Starts the host. `ready()` is the receiver page's: unlocked and connected.
const startBlockHost = ({ ready, receiver }) => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.channel !== channel) return false;
    // The extension's own pages only. A content script's sender carries the
    // site's URL; the browser sets it.
    if (sender?.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL(''))) return false;
    (async () => {
      // No unlock this page can follow (On close, locked): the popup does the
      // work itself.
      if (!(await unlocked(true)) || !(await ready())) return null;
      if (message.kind === 'state') return { state };
      if (message.kind === 'receive') {
        receiver.now();
        return { ok: true };
      }
      if (message.kind === 'forget' && Array.isArray(message.ids)) {
        state.jobs = state.jobs.filter((job) => !message.ids.includes(job.id));
        broadcast();
        return { ok: true };
      }
      if (message.kind === 'send') {
        const job = message.job;
        if (!job || typeof job.id !== 'string' || !Array.isArray(job.templates) || !job.templates.length ||
            state.jobs.some((entry) => entry.id === job.id)) return { accepted: false };
        const first = Primitives.AccountBlockTemplate.fromJson(job.templates[0]);
        state.jobs.unshift({
          id: job.id,
          status: pendingStatus.sending,
          ...describeOutgoingTemplate(first),
          ...job.row,
          network: null,
          startedAt: Date.now(),
        });
        run(job);
        return { accepted: true };
      }
      return null;
    })().then(sendResponse, () => sendResponse(null));
    return true;
  });
  // Told unasked as well, so a popup knows the host is still here.
  setInterval(broadcast, heartbeatMs);
};

export default startBlockHost;
