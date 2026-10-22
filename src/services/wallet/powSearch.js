import { fail } from '../utils/errors';

// Proof of work for the wallet's own sends and receives, in place of the SDK's.
//
// The SDK builds its worker from a blob: URL, which Firefox's extension
// content security policy refuses, so plasma was never generated there. This
// uses the static worker the approval window already uses
// (utils/approval-pow-worker.js), from the extension's own files.
//
// It runs several at once. The search starts at a random nonce in each worker,
// so each covers its own ground and the first answer wins: about one worker
// per physical core, which hardwareConcurrency counts twice on most machines.
// Phones heat up and slow down, so no more than four.
//
// Each worker first times a short deterministic search (benchmark), so the
// wallet knows this device's hash rate now. Each hash succeeds with chance
// 1/difficulty, so the expected time is difficulty / rate: that is the "about
// N s" shown beside "Generating plasma" (components/pow-countdown). It is an
// expectation, not a promise: some take twice as long.

const benchmarkMs = 150;
const threads = () => Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));

// The proofs of work under way in this page, for the countdown.
const running = new Map();
const listeners = new Set();
let nextId = 1;
const latest = () => [...running.values()].at(-1) || null;
const emit = () => listeners.forEach((listener) => listener(latest()));
export const onPowProgress = (listener) => {
  listeners.add(listener);
  listener(latest());
  return () => listeners.delete(listener);
};

export const generatePow = (hash, difficulty) => new Promise((resolve, reject) => {
  const id = nextId;
  nextId += 1;
  const workers = [];
  let settled = false;
  let rate = 0;
  let measured = 0;
  const finish = (error, nonce) => {
    if (settled) return;
    settled = true;
    workers.forEach((worker) => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    });
    running.delete(id);
    emit();
    if (error) reject(error);
    else resolve(nonce);
  };
  // Every worker reports its rate before any searches, so the estimate is
  // made from what they do together; one that cannot measure still searches.
  const measuredOne = (hashesPerMs) => {
    rate += hashesPerMs;
    measured += 1;
    if (measured !== workers.length) return;
    running.set(id, { startedAt: Date.now(), estimateMs: rate > 0 ? Number(difficulty) / rate : null });
    emit();
    workers.forEach((worker) => worker.postMessage({ hash, difficulty: String(difficulty) }));
  };
  try {
    for (let index = 0; index < threads(); index += 1) {
      const worker = new Worker(chrome.runtime.getURL('approval-pow-worker.js'));
      workers.push(worker);
      worker.onerror = () => finish(fail(137));
      worker.onmessageerror = () => finish(fail(819));
      worker.onmessage = ({ data }) => {
        if (data?.ready) worker.postMessage({ benchmark: true, ms: benchmarkMs });
        else if (typeof data?.hashes === 'number' && data.ms > 0) measuredOne(data.hashes / data.ms);
        else if (data?.benchmarkFailed) measuredOne(0);
        else if (typeof data?.nonce === 'string' && /^[0-9a-f]{16}$/i.test(data.nonce)) finish(null, data.nonce);
        else finish(data?.error ? fail(137) : fail(819));
      };
    }
  } catch (error) {
    finish(error);
  }
});
