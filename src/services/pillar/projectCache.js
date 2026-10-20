import { sha3_256 } from 'js-sha3';

import { signatures } from '../utils/contractCalls';

// The Accelerator's projects, kept between visits with the height they were
// complete at. Ported from syrius-sol (lib/services/accelerator_project_cache.dart).
//
// `embedded.accelerator.getAll` has the node read every project, phase and
// vote out of the contract's storage: about ten seconds on a public mainnet
// node for 201 projects, on every opening of the AZ tab. Projects are never
// deleted, so the list seen yesterday is still the list, less what happened
// since, and what happened since is on the contract's own account chain: its
// storage changes only when it receives a block (a project created, a phase
// added or replaced, a vote, and the Update the pillars send that closes
// votings and pays phases).
//
// So the cache holds the list with a snapshot, the height and hash of the
// contract's frontier block when it was read, and a refresh asks only for the
// blocks after it. None: the list is exact. Some: the projects they name are
// read again, with every project an Update can still move (isSettled), and
// the snapshot advances. A new project's id is the hash of the send block
// that created it (go-zenon CreateProjectMethod: project.Id = sendBlock.Hash),
// a phase's likewise.
//
// The cache is never the only path. Anything unexpected on the way (a block
// it cannot place, too long a gap, a project that will not load) ends in the
// full read the tab made before.

const acceleratorAddress = 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22';
const storageKey = 'znn.azProjects';
// An entry of another version is dropped, not migrated.
const version = 1;
// Chains kept. The app's store is the WebView's localStorage, a few MB shared
// with the wallets, and an entry is a few hundred kB on mainnet.
const maxChains = 2;
// Blocks asked for at a time, and the most pages followed before the full
// read is the faster way: the contract receives about 55 blocks a day on
// mainnet, so this is some five weeks away from the wallet.
const blockPageSize = 128;
const maxBlockPages = 16;
// The most projects read again one by one before the full read is cheaper.
const maxRefetch = 64;
const concurrency = 8;
const fullPageSize = 256;
const contractReceive = 5;

// go-zenon's project and phase statuses. Completed (4) is a project's only.
const status = { voting: 0, active: 1, paid: 2, closed: 3, completed: 4 };

// Whether nothing but a block naming the project can change it. Read off
// go-zenon's UpdateEmbeddedAcceleratorMethod, the one thing that changes
// projects no block names: it acts on a project in voting, and on an active
// project whose last phase is in voting. Closed and completed projects stay
// as they are; an active one with no phase, or with its last phase paid,
// waits for its owner to add a phase, in a block that names it. A vote can
// land on any of them, and a vote names what it votes on.
const isSettled = (project) => {
  if (project.status === status.closed || project.status === status.completed) return true;
  if (project.status !== status.active) return false;
  const phases = project.phases || [];
  return !phases.length || phases[phases.length - 1]?.phase?.status === status.paid;
};

const kinds = (() => {
  const byName = { CreateProject: 'create', AddPhase: 'phase', UpdatePhase: 'phase',
    VoteByName: 'vote', VoteByProdAddress: 'vote', Donate: 'none', Update: 'none' };
  const out = {};
  for (const signature of signatures.accelerator) {
    const kind = byName[signature.slice(0, signature.indexOf('('))];
    if (kind) out[sha3_256(signature).slice(0, 8)] = kind;
  }
  return out;
})();

const toHex = (base64) => {
  const binary = atob(base64 || '');
  let hex = '';
  for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
};

// Which call a send to the contract made, and the id it names: the first
// argument of AddPhase, UpdatePhase and the votes is a 32-byte hash, so it
// sits right after the selector whatever strings follow.
const callOf = (data) => {
  const hex = toHex(data);
  const kind = kinds[hex.slice(0, 8)];
  if (!kind) return { kind: 'unknown' };
  if (kind !== 'phase' && kind !== 'vote') return { kind };
  return hex.length >= 8 + 64 ? { kind, id: hex.slice(8, 72) } : { kind: 'unknown' };
};

class NotIncremental extends Error {}
class SnapshotGone extends Error {}

// The node's order: last update first, ties by id.
const sorted = (projects) => projects.sort((a, b) =>
  (b.lastUpdateTimestamp - a.lastUpdateTimestamp) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// The chain the node is on: its identifier and genesis. Asked on every load,
// never remembered: the same address can serve another chain after a node is
// switched or a devnet rebuilt. Read off the second momentum, as the hash
// before it; the first lists every genesis account and is large on mainnet.
const chainKey = async (request) => {
  const second = (await request('ledger.getMomentumsByHeight', [2, 1]))?.list?.[0];
  if (second) return `${second.chainIdentifier}:${second.previousHash}`;
  const genesis = (await request('ledger.getMomentumsByHeight', [1, 1]))?.list?.[0];
  if (!genesis) throw new NotIncremental('no momentum');
  return `${genesis.chainIdentifier}:${genesis.hash}`;
};

// The snapshot is taken before the list: a block landing between the two is
// looked at again on the next refresh. Taken after, it would be missed.
const full = async (request) => {
  const frontier = (await request('ledger.getAccountBlocksByPage', [acceleratorAddress, 0, 1]))?.list?.[0];
  const projects = [];
  for (let page = 0; ; page++) {
    const got = await request('embedded.accelerator.getAll', [page, fullPageSize]);
    const list = got?.list || [];
    projects.push(...list);
    if (!list.length || projects.length >= (got?.count ?? 0)) break;
  }
  return { height: frontier?.height || 0, hash: frontier?.hash || '', projects: sorted(projects) };
};

// The ids of the projects the blocks created or changed. Throws for a block it
// cannot place: an unknown call may be one a later protocol added, and
// guessing that it changed nothing is how a cache goes quietly wrong.
const touched = (blocks, known) => {
  const projects = new Set(known.map((project) => project.id));
  const projectOfPhase = new Map();
  for (const project of known) for (const id of project.phaseIds || []) projectOfPhase.set(id, project.id);
  const out = new Set();
  for (const block of blocks) {
    // The contract's own sends are an Update's payments; its genesis block is
    // a devnet's opening balance. Neither is a call.
    if (block.blockType !== contractReceive) continue;
    const send = block.pairedAccountBlock;
    if (!send) throw new NotIncremental('a receive with no send');
    const call = callOf(send.data);
    if (call.kind === 'create') { projects.add(send.hash); out.add(send.hash); }
    else if (call.kind === 'phase') {
      // Refused by the contract for a project that does not exist.
      if (projects.has(call.id)) { out.add(call.id); projectOfPhase.set(send.hash, call.id); }
    } else if (call.kind === 'vote') {
      // An id that is neither a known project nor phase is a refused vote.
      const project = projects.has(call.id) ? call.id : projectOfPhase.get(call.id);
      if (project) out.add(project);
    } else if (call.kind === 'unknown') throw new NotIncremental('a call the cache does not know');
  }
  return out;
};

// The entry brought up to the node's frontier, or the entry itself when no
// block followed its snapshot. The first block asked for is the snapshot's
// own: finding it where it was proves this is the chain the list came from.
const advance = async (request, entry) => {
  const blocks = [];
  const anchored = entry.height > 0;
  let from = anchored ? entry.height : 1;
  let complete = false;
  for (let page = 0; page < maxBlockPages; page++) {
    const got = (await request('ledger.getAccountBlocksByHeight', [acceleratorAddress, from, blockPageSize]))?.list || [];
    if (page === 0 && anchored) {
      if (!got.length) throw new SnapshotGone('the node is behind the snapshot');
      if (got[0].height !== entry.height || got[0].hash !== entry.hash) throw new SnapshotGone('another block at the snapshot height');
      blocks.push(...got.slice(1));
    } else blocks.push(...got);
    if (got.length < blockPageSize) { complete = true; break; }
    from += blockPageSize;
  }
  if (!complete) throw new NotIncremental('too many blocks since');
  if (!blocks.length) return entry;

  const again = touched(blocks, entry.projects);
  for (const project of entry.projects) if (!isSettled(project)) again.add(project.id);
  if (again.size > maxRefetch) throw new NotIncremental('too many projects to read again');
  const byId = new Map(entry.projects.map((project) => [project.id, project]));
  const ids = [...again];
  for (let i = 0; i < ids.length; i += concurrency) {
    const got = await Promise.all(ids.slice(i, i + concurrency)
      .map((id) => request('embedded.accelerator.getProjectById', [id])));
    for (const project of got) {
      if (!project?.id) throw new NotIncremental('a project that did not load');
      byId.set(project.id, project);
    }
  }
  const last = blocks[blocks.length - 1];
  return { height: last.height, hash: last.hash, projects: sorted([...byId.values()]) };
};

// Decoded entries, by chain, so coming back to the tab reads no storage.
const memory = new Map();

const readStore = async () => {
  try {
    const stored = (await chrome.storage.local.get(storageKey))[storageKey];
    return stored && stored.version === version && stored.chains && typeof stored.chains === 'object' ? stored : { version, chains: {} };
  } catch (error) { return { version, chains: {} }; }
};
const validEntry = (entry) => entry && Number.isInteger(entry.height) && typeof entry.hash === 'string' &&
  Array.isArray(entry.projects) && entry.projects.every((project) => typeof project?.id === 'string');
const read = async (key) => {
  if (memory.has(key)) return memory.get(key);
  const entry = (await readStore()).chains[key];
  if (!validEntry(entry)) return null;
  memory.set(key, entry);
  return entry;
};
// The list is shown either way; a failed write means the next visit reads in full.
const write = async (key, entry) => {
  try {
    const stored = await readStore();
    // This chain first, then the most recently saved others.
    const others = Object.entries(stored.chains).filter(([other]) => other !== key)
      .sort(([, a], [, b]) => (b.savedAt || 0) - (a.savedAt || 0));
    const kept = [[key, { ...entry, savedAt: Date.now() }], ...others].slice(0, maxChains);
    await chrome.storage.local.set({ [storageKey]: { version, chains: Object.fromEntries(kept) } });
  } catch (error) { /* not stored */ }
};
const drop = async (key) => {
  memory.delete(key);
  try {
    const stored = await readStore();
    if (!(key in stored.chains)) return;
    delete stored.chains[key];
    await chrome.storage.local.set({ [storageKey]: stored });
  } catch (error) { /* gone from memory at least */ }
};

// Every project: the stored list at once, then the list brought up to the
// node's frontier. `onList(projects, { fromCache })` is called for each, and
// `onList(null)` when a list just shown belongs to a chain the node is not
// on, before the full read. Resolves when the final list has been handed over.
const load = async (request, onList) => {
  const key = await chainKey(request);
  const stored = await read(key);
  if (stored) onList(stored.projects, { fromCache: true });
  let current = null;
  if (stored) {
    try { current = await advance(request, stored); }
    catch (error) {
      if (error instanceof SnapshotGone) { await drop(key); onList(null); }
      // Anything else: the full read below.
    }
  }
  if (!current) current = await full(request);
  if (current !== stored) {
    memory.set(key, current);
    await write(key, current);
  }
  onList(current.projects, { fromCache: false });
};

export { load, isSettled, callOf, touched, storageKey, acceleratorAddress };
