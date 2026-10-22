import { Zenon } from 'znn-ts-sdk';

// What the connected Zenon node says about itself and the chain it follows.
//
// A node answers `stats.syncInfo` "done" for as long as it is level with its
// peers, which is also true of a chain that has stopped: on 2026-10-11 the
// devnet sat one momentum short of a spork for hours and every node reported
// itself synced. So the first thing shown is the age of the newest momentum,
// against the ten seconds a momentum takes.
//
// A public node may refuse `stats.osInfo` or `stats.networkInfo`; each read
// stands alone and a refused one is shown as not shared, not as an error.
//
// Checked in utils/operator-mode-test.js.

// go-zenon `protocol/interfaces.go` SyncState.
const syncStates = {
  0: { kind: 'neutral', label: 'Unknown' },
  1: { kind: 'pending', label: 'Syncing' },
  2: { kind: 'success', label: 'Synced' },
  3: { kind: 'warning', label: 'Not enough peers' },
};
const syncStatus = (state) => syncStates[Number(state)] || syncStates[0];

const momentumSeconds = 10;
// Twelve momentums late. The devnet's own cadence wanders to about fifteen
// seconds, and one slow pillar should not read as a stopped chain.
const stalledAfter = 12 * momentumSeconds;

// Seconds since the newest momentum, or null when either time is unknown. A
// node clock ahead of this one gives zero, not a negative age.
const momentumAge = (timestamp, now = Date.now()) => {
  const at = Number(timestamp);
  if (!Number.isFinite(at) || at <= 0) return null;
  return Math.max(0, Math.floor(now / 1000) - at);
};

const chainStatus = (age) => {
  if (age === null) return { kind: 'neutral', label: 'Unknown' };
  return age > stalledAfter ? { kind: 'warning', label: 'Stalled' } : { kind: 'success', label: 'Producing' };
};

const formatAge = (seconds) => {
  if (seconds === null) return '';
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours} h ${Math.floor((seconds % 3600) / 60)} min ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

const units = ['B', 'KB', 'MB', 'GB', 'TB'];
const formatBytes = (bytes) => {
  let value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

// Memory in use as a share of the total, 0 to 100, or null.
const memoryUsedPercent = (os) => {
  const total = Number(os?.memoryTotal);
  const free = Number(os?.memoryFree);
  if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0 || free < 0 || free > total) return null;
  return Math.round(((total - free) / total) * 100);
};

// How far behind its target the node is, in momentums.
const behind = (sync) => {
  const current = Number(sync?.currentHeight);
  const target = Number(sync?.targetHeight);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;
  return Math.max(0, target - current);
};

const request = (method, params = []) => Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);
// A read the node refused, or that failed, is null: the rest still show.
const optional = (promise) => promise.then((value) => value ?? null, () => null);

const read = async () => {
  const [frontier, sync, process, network, os] = await Promise.all([
    request('ledger.getFrontierMomentum'),
    optional(request('stats.syncInfo')),
    optional(request('stats.processInfo')),
    optional(request('stats.networkInfo')),
    optional(request('stats.osInfo')),
  ]);
  return { frontier, sync, process, network, os };
};

export { syncStatus, momentumSeconds, stalledAfter, momentumAge, chainStatus, formatAge, formatBytes, memoryUsedPercent, behind, read };
