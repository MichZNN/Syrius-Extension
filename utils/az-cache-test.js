'use strict';
// The Accelerator project cache (src/services/pillar/projectCache.js) against
// a fake node holding the contract's account chain and its projects: a cold
// read, a warm visit that asks for nothing but the blocks since, the projects
// those blocks name and the ones an Update can move, a snapshot the node no
// longer has, and every way it falls back to the full read.
//
//   node utils/az-cache-test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const compile = (file) => babel.transformFileSync(path.join(root, file), {
  presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]], babelrc: false, configFile: false,
}).code;
const sources = new Map();
// A fresh module per visit after a restart: the cache keeps decoded entries
// in memory for the popup's lifetime.
const loadModule = (file, environment = {}) => {
  const cache = new Map();
  const load = (name) => {
    const filename = path.resolve(root, name);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    if (!sources.has(filename)) sources.set(filename, compile(path.relative(root, filename)));
    const requireModule = (id) => (id.startsWith('.') ? load(path.resolve(path.dirname(filename), id) + '.js') : require(id));
    new Function('module', 'exports', 'require', ...Object.keys(environment), sources.get(filename))(module, module.exports, requireModule, ...Object.values(environment));
    return module.exports;
  };
  return load(file);
};
const { encodeCall } = loadModule('src/services/pillar/encode.js');

const hash = (n) => n.toString(16).padStart(64, '0');
const base64 = (hex) => Buffer.from(hex, 'hex').toString('base64');
const status = { voting: 0, active: 1, paid: 2, closed: 3, completed: 4 };
const project = (id, fields = {}) => ({ id, owner: 'z1owner', name: 'p' + id.slice(-3), description: '', url: '',
  znnFundsNeeded: '1', qsrFundsNeeded: '1', creationTimestamp: 1, lastUpdateTimestamp: 1, status: status.closed,
  phaseIds: [], votes: { id, total: 0, yes: 0, no: 0 }, phases: [], ...fields });
const phase = (id, projectId, phaseStatus) => ({ phase: { id, projectID: projectId, name: 'phase', status: phaseStatus }, votes: { id, total: 0, yes: 0, no: 0 } });

// The node: momentums for the chain key, the contract's blocks by height, and
// the projects. Every request is recorded.
const node = ({ chain = 1, genesis = hash(0xfeed) } = {}) => {
  const state = { chain, genesis, blocks: [], projects: new Map(), calls: [], nextHash: 0x1000 };
  const block = (fields) => {
    const height = state.blocks.length + 1;
    const entry = { height, hash: hash(state.nextHash++), ...fields };
    state.blocks.push(entry);
    return entry;
  };
  state.receive = (data, sendHash = hash(state.nextHash++)) => block({ blockType: 5, pairedAccountBlock: { hash: sendHash, data: base64(data) } });
  state.payment = () => block({ blockType: 4 });
  state.put = (entry) => state.projects.set(entry.id, entry);
  state.request = async (method, params) => {
    state.calls.push(method);
    switch (method) {
      case 'ledger.getMomentumsByHeight':
        return { list: params[0] === 2 ? [{ chainIdentifier: state.chain, previousHash: state.genesis }] : [] };
      case 'ledger.getAccountBlocksByPage':
        return { list: state.blocks.length ? [state.blocks[state.blocks.length - 1]] : [] };
      case 'ledger.getAccountBlocksByHeight':
        return { list: state.blocks.slice(params[1] - 1, params[1] - 1 + params[2]) };
      case 'embedded.accelerator.getAll': {
        const all = [...state.projects.values()];
        return { count: all.length, list: all.slice(params[0] * params[1], (params[0] + 1) * params[1]) };
      }
      case 'embedded.accelerator.getProjectById':
        return structuredClone(state.projects.get(params[0])) || null;
      default: throw Error('unexpected ' + method);
    }
  };
  return state;
};
const storage = () => {
  const data = {};
  return { data, chrome: { storage: { local: {
    get: async (key) => ({ [key]: structuredClone(data[key]) }),
    set: async (values) => { for (const [key, value] of Object.entries(values)) data[key] = structuredClone(value); },
  } } } };
};
const visit = async (cache, fake) => {
  const lists = [];
  fake.calls.length = 0;
  await cache.load(fake.request, (projects, meta) => lists.push(projects && { ids: projects.map((p) => p.id), fromCache: meta?.fromCache, projects }));
  return lists;
};

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; };

(async () => {
  const store = storage();
  const fake = node();
  const settled = project(hash(1), { status: status.closed });
  const voting = project(hash(2), { status: status.voting, lastUpdateTimestamp: 5 });
  const paidOut = project(hash(3), { status: status.active, phaseIds: [hash(31)], phases: [phase(hash(31), hash(3), status.paid)] });
  const phaseVoting = project(hash(4), { status: status.active, phaseIds: [hash(41)], phases: [phase(hash(41), hash(4), status.voting)] });
  for (const entry of [settled, voting, paidOut, phaseVoting]) fake.put(entry);
  fake.payment();
  const cache = loadModule('src/services/pillar/projectCache.js', { chrome: store.chrome });

  await check('cold visit reads in full and stores the snapshot', async () => {
    const lists = await visit(cache, fake);
    assert.equal(lists.length, 1); assert.equal(lists[0].fromCache, false);
    assert.equal(lists[0].ids[0], hash(2), 'last update first');
    assert(fake.calls.includes('embedded.accelerator.getAll'));
    const entry = Object.values(store.data['znn.azProjects'].chains)[0];
    assert.equal(entry.height, 1); assert.equal(entry.hash, fake.blocks[0].hash);
  });

  await check('warm visit with no new block asks only for the snapshot block', async () => {
    const lists = await visit(cache, fake);
    assert.deepEqual(lists.map((list) => list.fromCache), [true, false]);
    assert.deepEqual(fake.calls, ['ledger.getMomentumsByHeight', 'ledger.getAccountBlocksByHeight']);
  });

  await check('a restarted popup reads the stored entry, not the node', async () => {
    const fresh = loadModule('src/services/pillar/projectCache.js', { chrome: store.chrome });
    const lists = await visit(fresh, fake);
    assert.equal(lists[0].fromCache, true); assert.equal(lists[0].ids.length, 4);
    assert(!fake.calls.includes('embedded.accelerator.getAll'));
  });

  await check('new blocks re-read the projects they name and the unsettled ones', async () => {
    // A vote on the settled project, a vote on a phase, a new project, a
    // phase on the paid-out project, and an Update.
    fake.put({ ...settled, votes: { id: settled.id, total: 1, yes: 1, no: 0 } });
    fake.receive(encodeCall('accelerator', 'VoteByName', ['0x' + settled.id, 'pillar', 0]));
    fake.receive(encodeCall('accelerator', 'VoteByName', ['0x' + hash(41), 'pillar', 1]));
    const created = fake.receive(encodeCall('accelerator', 'CreateProject', ['new', 'd', 'https://x.invalid', '1', '1']));
    fake.put(project(created.pairedAccountBlock.hash, { status: status.voting, lastUpdateTimestamp: 9 }));
    const added = fake.receive(encodeCall('accelerator', 'AddPhase', ['0x' + paidOut.id, 'n', 'd', 'https://x.invalid', '1', '1']));
    fake.put({ ...paidOut, phaseIds: [hash(31), added.pairedAccountBlock.hash], phases: [...paidOut.phases, phase(added.pairedAccountBlock.hash, paidOut.id, status.voting)] });
    fake.receive(encodeCall('accelerator', 'Update', []));
    fake.payment();
    const lists = await visit(cache, fake);
    const final = lists.at(-1);
    assert.equal(final.fromCache, false); assert.equal(final.ids.length, 5); assert.equal(final.ids[0], created.pairedAccountBlock.hash);
    assert(!fake.calls.includes('embedded.accelerator.getAll'));
    const refetched = fake.calls.filter((call) => call === 'embedded.accelerator.getProjectById').length;
    // settled (vote), phaseVoting (phase vote, unsettled), created, paidOut (phase), voting (unsettled).
    assert.equal(refetched, 5);
    assert.equal(final.projects.find((p) => p.id === settled.id).votes.yes, 1);
    assert.equal(final.projects.find((p) => p.id === paidOut.id).phases.length, 2);
    const entry = Object.values(store.data['znn.azProjects'].chains)[0];
    assert.equal(entry.height, fake.blocks.length); assert.equal(entry.hash, fake.blocks.at(-1).hash);
  });

  await check('a snapshot the node does not have is taken down, then read in full', async () => {
    const other = node(); for (const entry of fake.projects.values()) other.put(entry);
    for (let i = 0; i < fake.blocks.length; i++) other.payment();
    const lists = await visit(cache, other);
    assert.equal(lists[0].fromCache, true); assert.equal(lists[1], null); assert.equal(lists[2].fromCache, false);
    assert(other.calls.includes('embedded.accelerator.getAll'));
  });

  await check('a call the cache does not know falls back to the full read', async () => {
    const lab = node(); lab.put(settled); lab.payment();
    const cold = loadModule('src/services/pillar/projectCache.js', { chrome: storage().chrome });
    await visit(cold, lab);
    lab.receive('deadbeef' + hash(1));
    await visit(cold, lab);
    assert(lab.calls.includes('embedded.accelerator.getAll'));
  });

  await check('too long a gap falls back to the full read', async () => {
    const lab = node(); lab.put(settled); lab.payment();
    const cold = loadModule('src/services/pillar/projectCache.js', { chrome: storage().chrome });
    await visit(cold, lab);
    for (let i = 0; i < 128 * 16 + 1; i++) lab.payment();
    await visit(cold, lab);
    assert(lab.calls.includes('embedded.accelerator.getAll'));
    assert.equal(lab.calls.filter((call) => call === 'ledger.getAccountBlocksByHeight').length, 16);
  });

  await check('chains are kept apart, two at most', async () => {
    const own = storage();
    const cold = loadModule('src/services/pillar/projectCache.js', { chrome: own.chrome });
    for (const chain of [1, 3, 69]) { const lab = node({ chain }); lab.put(settled); lab.payment(); await visit(cold, lab); }
    assert.deepEqual(Object.keys(own.data['znn.azProjects'].chains).map((key) => key.split(':')[0]).sort(), ['3', '69']);
  });

  await check('settled is what no unnamed block can change', async () => {
    assert.equal(cache.isSettled(settled), true);
    assert.equal(cache.isSettled(project(hash(9), { status: status.completed })), true);
    assert.equal(cache.isSettled(voting), false);
    assert.equal(cache.isSettled(paidOut), true);
    assert.equal(cache.isSettled(phaseVoting), false);
    assert.equal(cache.isSettled(project(hash(9), { status: status.active })), true);
    assert.equal(cache.isSettled(project(hash(9), { status: status.paid })), false);
    assert.equal(cache.isSettled(project(hash(9), { status: 7 })), false);
  });

  await check('calls are read from the wallet\'s own encoding', async () => {
    assert.deepEqual(cache.callOf(base64(encodeCall('accelerator', 'VoteByName', ['0x' + hash(5), 'x', 2]))), { kind: 'vote', id: hash(5) });
    assert.deepEqual(cache.callOf(base64(encodeCall('accelerator', 'UpdatePhase', ['0x' + hash(6), 'n', 'd', 'u', '1', '1']))), { kind: 'phase', id: hash(6) });
    assert.deepEqual(cache.callOf(base64(encodeCall('accelerator', 'Donate', []))), { kind: 'none' });
    assert.deepEqual(cache.callOf(base64('00')), { kind: 'unknown' });
  });

  console.log(`az-cache: cold, warm, restart, incremental, snapshot gone, fallbacks, chains, settled and calls: ${passed} passed`);
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
