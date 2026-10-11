'use strict';
// Pillar mode, checked without a browser, a node or a key: the menus it
// changes, the contract rules its forms enforce (against go-zenon's own), the
// call data it sends (against the SDK where the SDK works), the order of the
// revoke guard, the delegator APR and the Delegate sort. Also the redesign's
// standing rules: no reduced-motion branch, nothing fetched from a CDN, no
// colour outside the token blocks, every menu icon present.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const memory = new Map();
global.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
global.window = { localStorage: global.localStorage, crypto: require('node:crypto').webcrypto };

const load = (file, cache = new Map()) => {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename);
  const mod = { exports: {} };
  cache.set(filename, mod.exports);
  const { code } = babel.transformFileSync(filename, {
    presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react'], babelrc: false, configFile: false,
  });
  const resolve = (name) => (name.startsWith('.')
    ? load(path.resolve(path.dirname(filename), name) + (path.extname(name) ? '' : '.js'), cache) : require(name));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, resolve);
  cache.set(filename, mod.exports);
  return mod.exports;
};
const cache = new Map();
const rules = load('src/services/pillar/rules.js', cache);
const { encodeCall } = load('src/services/pillar/encode.js', cache);
const { templates } = load('src/services/pillar/calls.js', cache);
const { menuFor, isPillarMode, modes } = load('src/services/utils/menu.js', cache);
const guard = load('src/services/pillar/revokeGuard.js', cache);
const apr = load('src/services/pillar/apr.js', cache);
const { sortPillars, sortChoices } = load('src/services/pillar/sort.js', cache);
const { resolveTheme } = load('src/services/utils/theme.js', cache);
const { defaultSettings } = load('src/services/utils/storage.js', cache);
const lucide = load('src/components/icon/lucide.js', cache).default;
const spork = load('src/services/spork/spork.js', cache);
const { Zenon, Primitives } = require('znn-ts-sdk');
const { sha3_256 } = require('js-sha3');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; } catch (error) { console.error(`FAIL ${name}`); throw error; }
};

const keys = (list) => list.map((entry) => entry.to);

//
// Menus
//
test('pillar mode off leaves the Zenon tabs as they were', () => {
  assert.deepEqual(keys(menuFor({ pillarMode: false }).tabs), ['dashboard', 'tokens', 'delegate', 'plasma', 'stake']);
  assert.deepEqual(menuFor({}).more, []);
  assert.deepEqual(menuFor(undefined), menuFor({}), 'no settings read yet');
  assert.equal(defaultSettings.pillarMode, false);
});

test('pillar mode on puts Pillar, Rewards and AZ on the bar and keeps Plasma', () => {
  const { tabs } = menuFor({ pillarMode: true });
  assert.deepEqual(keys(tabs), ['dashboard', 'pillar', 'rewards', 'az', 'plasma']);
  assert.deepEqual(tabs.map((tab) => tab.label), ['Home', 'Pillar', 'Rewards', 'AZ', 'Plasma']);
});

test('no screen becomes unreachable when pillar mode is on', () => {
  const before = keys(menuFor({ pillarMode: false }).tabs);
  const after = menuFor({ pillarMode: true });
  const reachable = new Set([...keys(after.tabs), ...keys(after.more)]);
  for (const to of before) assert.ok(reachable.has(to), `${to} lost`);
  assert.ok(after.tabs.length <= 6, 'the bar holds six at most');
});

test('operator modes add their pages to the header menu, and only there', () => {
  const none = menuFor({});
  // A bridge mode stored by an earlier build adds nothing: there is no bridge page.
  const all = menuFor({ sentinelMode: true, sporkMode: true, bridgeMode: true });
  assert.deepEqual(keys(all.tabs), keys(none.tabs), 'the tab bar does not change');
  assert.deepEqual(keys(all.more), ['sentinel', 'settings/sporks']);
  assert.deepEqual(modes.map((mode) => mode.key), ['pillarMode', 'sentinelMode', 'sporkMode']);
  assert.equal('bridgeMode' in defaultSettings, false);
  const withPillar = menuFor({ pillarMode: true, sporkMode: true });
  assert.ok(keys(withPillar.more).includes('settings/sporks') && keys(withPillar.more).includes('delegate'));
  for (const key of ['pillarMode', 'sentinelMode', 'sporkMode']) assert.equal(defaultSettings[key], false, key);
});

test('pillar mode is on for any truthy stored value', () => {
  assert.equal(isPillarMode({ pillarMode: 'yes' }), true);
  assert.equal(isPillarMode({ pillarMode: false }), false);
  assert.equal(isPillarMode(undefined), false);
});

test('every menu icon is in the vendored set', () => {
  const all = [true, false].flatMap((mode) => {
    const m = menuFor({ pillarMode: mode, sentinelMode: mode, sporkMode: mode });
    return [...m.tabs, ...m.more];
  });
  for (const entry of all) assert.ok(lucide[entry.icon], `icon ${entry.icon}`);
  for (const name of ['wallet', 'link', 'settings', 'plus', 'lock', 'pillar', 'sentinel', 'spork', 'token', 'chart', 'live', 'rewards', 'vote', 'warning', 'thumbs-up', 'thumbs-down', 'minus']) {
    assert.ok(lucide[name], `icon ${name}`);
  }
});

//
// Contract rules, against go-zenon's
//
const goNamePattern = /^([a-zA-Z0-9]+[-._]?)*[a-zA-Z0-9]$/; // vm/embedded/implementation/pillars.go
test('pillar names: the same answers as go-zenon, without its backtracking', () => {
  const names = ['a', 'Pillar1', 'my-pillar', 'my.pillar_1', 'a-b-c', 'x'.repeat(40), 'x'.repeat(41), '',
    '-a', 'a-', 'a--b', 'a-.b', 'a b', 'ä', 'a_', '_a', 'A.B.C', '1', 'a.b-c_d'];
  for (const name of names) {
    const go = name.length > 0 && name.length <= 40 && goNamePattern.test(name);
    assert.equal(rules.pillarNameError(name) === null, go, JSON.stringify(name));
  }
  const started = Date.now();
  rules.pillarNameError(`${'a'.repeat(39)}-`);
  rules.pillarNameError(`${'a-'.repeat(19)}a!`);
  assert.ok(Date.now() - started < 50, 'no catastrophic backtracking');
});

test('percentages are whole numbers from 0 to 100', () => {
  for (const ok of ['0', '100', '55', 7]) assert.equal(rules.percentageError(ok), null, String(ok));
  for (const bad of ['101', '-1', '1.5', '', 'abc', '1000']) assert.ok(rules.percentageError(bad), bad);
});

test('producer and reward addresses must be user addresses', () => {
  assert.equal(rules.userAddressError('z1qq6eg8n43g032hanpsfp02qcdmv7zfj3y2lt5d'), null);
  assert.ok(rules.userAddressError('z1qxemdeddedxpyllarxxxxxxxxxxxxxxxsy3fmg'), 'embedded contract');
  assert.ok(rules.userAddressError('z1zvmzvm69xxxxxxxxxxxxxxxxxxxxxxxxufk4x6'), 'not a user address');
  assert.ok(rules.userAddressError('0x54528274D9e108D9dfdBa40bCb6de7aF0385b7f3'));
  assert.ok(rules.userAddressError('z1qq6eg8n43g032hanpsfp02qcdmv7zfj3y2lt5'));
});

test('stake and cost constants are go-zenon\'s', () => {
  assert.equal(rules.pillarStakeZnn, 15000n * 100000000n); // PillarStakeAmount
  assert.equal(rules.projectCreationZnn, 100000000n); // ProjectCreationAmount
  assert.equal(rules.projectZnnMax, 5000n * 100000000n);
  assert.equal(rules.projectQsrMax, 50000n * 100000000n);
  assert.equal(rules.pillarLockDays, 83);
  assert.equal(rules.pillarRevokeDays, 7);
  assert.equal(rules.voteAcceptancePercent, 33);
});

test('registration needs the ZNN held and the QSR cost deposited', () => {
  const cost = (160000n * 100000000n).toString();
  assert.deepEqual(rules.registrationShortfall({ znnBalance: rules.pillarStakeZnn.toString(), qsrDeposited: cost, qsrCost: cost }),
    { znnShort: 0n, qsrShort: 0n, ready: true });
  const short = rules.registrationShortfall({ znnBalance: '0', qsrDeposited: '0', qsrCost: cost });
  assert.equal(short.ready, false);
  assert.equal(short.znnShort, rules.pillarStakeZnn);
  assert.equal(short.qsrShort, BigInt(cost));
  assert.equal(rules.registrationShortfall({ znnBalance: '1', qsrDeposited: '1', qsrCost: '0' }).ready, false, 'an unread cost is not ready');
});

test('the revoke window repeats 83 days shut, 7 open, from registration', () => {
  const day = 86400;
  assert.deepEqual(rules.revokeWindowAt(0, 0), { revocable: false, seconds: 83 * day });
  assert.deepEqual(rules.revokeWindowAt(0, 83 * day), { revocable: true, seconds: 7 * day });
  assert.deepEqual(rules.revokeWindowAt(0, 90 * day - 1), { revocable: true, seconds: 1 });
  assert.deepEqual(rules.revokeWindowAt(0, 90 * day), { revocable: false, seconds: 83 * day });
  assert.deepEqual(rules.revokeWindow({ isRevocable: true, revokeCooldown: 3600 }), { revocable: true, seconds: 3600 });
  assert.equal(rules.formatDuration(83 * day), '83 d');
  assert.equal(rules.formatDuration(day + 3 * 3600), '1 d 3 h');
  assert.equal(rules.formatDuration(59), '1 min');
});

test('an update lists only what it changes', () => {
  const current = { producerAddress: 'z1a', withdrawAddress: 'z1b', giveMomentumRewardPercentage: 0, giveDelegateRewardPercentage: 100 };
  assert.deepEqual(rules.pillarChanges(current, { ...current }), []);
  assert.deepEqual(rules.pillarChanges(current, { ...current, giveDelegateRewardPercentage: 90 }).map((c) => c.key), ['giveDelegateRewardPercentage']);
});

const goUrl = /^([Hh][Tt][Tt][Pp][Ss]?:\/\/)?[a-zA-Z0-9]{2,60}\.[a-zA-Z]{1,6}([-a-zA-Z0-9()@:%_+.~#?&/=]{0,100})$/;
test('projects: go-zenon\'s limits, and links opened only as https', () => {
  const ok = { name: 'Name', description: 'Description', url: 'forum.zenon.org/t/1', znn: '0', qsr: '0' };
  assert.equal(rules.projectError(ok), null);
  assert.ok(rules.projectError({ ...ok, name: 'x'.repeat(31) }));
  assert.ok(rules.projectError({ ...ok, description: 'x'.repeat(241) }));
  assert.ok(rules.projectError({ ...ok, description: '' }));
  assert.ok(rules.projectError({ ...ok, znn: (rules.projectZnnMax + 1n).toString() }));
  assert.ok(rules.projectError({ ...ok, qsr: (rules.projectQsrMax + 1n).toString() }));
  for (const url of ['forum.zenon.org/t/1', 'https://x.io', 'javascript:alert(1)', 'http://a.b', 'ftp://zenon.org', 'data:text/html,1']) {
    assert.equal(rules.projectError({ ...ok, url }) === null, goUrl.test(url), url);
    const link = rules.projectLink(url);
    if (link) assert.match(link, /^https?:\/\//);
  }
  assert.equal(rules.projectLink('javascript:alert(1)'), null);
  assert.equal(rules.projectLink('forum.zenon.org/t/1'), 'https://forum.zenon.org/t/1');
});

test('what a pillar can vote on: projects in voting, and an active project\'s open phase', () => {
  const projects = [
    { id: 'p1', name: 'Voting', status: 0, phases: [] },
    { id: 'p2', name: 'Active, phase voting', status: 1, phases: [{ phase: { id: 'f1', name: 'One', status: 2 } }, { phase: { id: 'f2', name: 'Two', status: 0 } }] },
    { id: 'p3', name: 'Active, phase paid', status: 1, phases: [{ phase: { id: 'f3', status: 2 } }] },
    { id: 'p4', name: 'Closed', status: 3, phases: [] },
  ];
  assert.deepEqual(rules.votables(projects).map((item) => `${item.kind}:${item.id}`), ['project:p1', 'phase:f2']);
  assert.equal(rules.canAddPhase({ ...projects[2], owner: 'me' }, 'me'), true);
  assert.equal(rules.canAddPhase({ ...projects[1], owner: 'me' }, 'me'), false, 'one phase at a time');
  assert.equal(rules.canAddPhase({ ...projects[2], owner: 'me' }, 'you'), false, 'owner only');
  assert.equal(rules.canUpdatePhase({ ...projects[1], owner: 'me' }, 'me'), true);
  assert.equal(rules.canUpdatePhase({ ...projects[2], owner: 'me' }, 'me'), false);
});

test('a vote passes as the contract counts it', () => {
  // checkAcceleratorVotes: yes > no, and total*100 > pillars*33
  assert.equal(rules.votePasses({ yes: 2, no: 0, total: 2 }, 3), true);
  assert.equal(rules.votePasses({ yes: 1, no: 0, total: 1 }, 3), true, '1 of 3 is more than 33%');
  assert.equal(rules.votePasses({ yes: 1, no: 0, total: 1 }, 4), false, '1 of 4 is not');
  assert.equal(rules.votePasses({ yes: 2, no: 2, total: 4 }, 4), false, 'a tie fails');
  assert.equal(rules.votePasses({ yes: 34, no: 0, total: 34 }, 100), true);
  assert.equal(rules.votePasses({ yes: 33, no: 0, total: 33 }, 100), false);
  assert.deepEqual([0, 1, 2, 3].map(rules.isVote), [true, true, true, false]);
});

//
// Call data
//
const hex = (template) => Buffer.from(template.data).toString('hex');
const a1 = 'z1qq6eg8n43g032hanpsfp02qcdmv7zfj3y2lt5d';
const a2 = 'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7';
const sdk = Zenon.getSingleton().embedded;

test('pillar calls match the SDK byte for byte where the SDK works', () => {
  assert.equal(hex(templates.revoke('abc')), hex(sdk.pillar.revoke('abc')));
  assert.equal(hex(templates.collect()), hex(sdk.pillar.collectReward()));
  assert.equal(hex(templates.withdrawQsr()), hex(sdk.pillar.withdrawQsr()));
  const pillar = { name: 'abc', producerAddress: a1, withdrawAddress: a2, momentumPercent: 10, delegatePercent: 50 };
  // The SDK's encoder takes the addresses as strings, despite its types.
  assert.equal(hex(templates.update(pillar)), hex(sdk.pillar.updatePillar('abc', a1, a2, 10, 50)));
  assert.equal(hex(templates.register(pillar)), hex(sdk.pillar.register('abc', a1, a2, 10, 50)));
});

test('amounts and tokens are what the contract checks', () => {
  const reg = templates.register({ name: 'abc', producerAddress: a1, withdrawAddress: a1, momentumPercent: 0, delegatePercent: 100 });
  assert.equal(reg.amount.toString(), rules.pillarStakeZnn.toString());
  assert.equal(reg.tokenStandard.toString(), 'zts1znnxxxxxxxxxxxxx9z4ulx');
  assert.equal(reg.toAddress.toString(), 'z1qxemdeddedxpyllarxxxxxxxxxxxxxxxsy3fmg');
  // The SDK's own depositQsr sends ZNN, which DepositQsr refuses.
  const deposit = templates.depositQsr('500');
  assert.equal(deposit.tokenStandard.toString(), 'zts1qsrxxxxxxxxxxxxxmrhjll');
  assert.equal(deposit.amount.toString(), '500');
  assert.equal(templates.revoke('abc').amount.toString(), '0');
});

test('accelerator calls: VoteByName layout, the 1 ZNN fee, phases free', () => {
  const id = 'c4716bc16d4a9e0c7b4158adf34f9ee6d88e5e240b9f3b1cd52a570a65a5c937';
  const vote = templates.vote(id, 'dev1', 1);
  const data = hex(vote);
  assert.equal(data.slice(0, 8), sha3_256('VoteByName(hash,string,uint8)').slice(0, 8));
  assert.equal(data.slice(8, 72), id, 'the hash is the first word');
  assert.equal(parseInt(data.slice(136, 200), 16), 1, 'the vote is the third word');
  assert.equal(vote.toAddress.toString(), 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22');
  assert.equal(vote.amount.toString(), '0');
  assert.throws(() => templates.vote(id, 'dev1', 3), /Yes, No or Abstain/);
  // A vote sent from this build on devnet, 2026-10-11 (account z1qq6eg8…, height 3200).
  assert.equal(Buffer.from(data, 'hex').toString('base64'),
    'XGwQZMRxa8FtSp4Me0FYrfNPnubYjl4kC587HNUqVwplpck3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEZGV2MQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  const project = { name: 'n', description: 'd', url: 'a.io', znn: '1', qsr: '2' };
  assert.equal(templates.createProject(project).amount.toString(), rules.projectCreationZnn.toString());
  assert.equal(hex(templates.createProject(project)).slice(0, 8), sha3_256('CreateProject(string,string,string,uint256,uint256)').slice(0, 8));
  assert.equal(templates.addPhase(id, project).amount.toString(), '0');
  assert.equal(hex(templates.updatePhase(id, project)).slice(8, 72), id);
  assert.throws(() => encodeCall('pillar', 'Nope', []), /Unknown call/);
  assert.throws(() => encodeCall('pillar', 'Revoke', []), /takes 1/);
});

//
// The revoke guard
//
const day = 86400;
const open = { name: 'p', isRevocable: true, revokeCooldown: day };
const shut = { name: 'p', isRevocable: false, revokeCooldown: day };
const events = ['press', 'password', 'confirmed', 'cancel'];

test('revoke: press, then a verified password, then a confirmation', () => {
  const { steps, advance } = guard;
  let step = steps.idle;
  step = advance(step, 'press', { pillar: open });
  assert.equal(step, steps.password);
  assert.equal(advance(step, 'password', { pillar: open, verified: false }), steps.password, 'wrong password stays');
  assert.equal(advance(step, 'password', { pillar: open }), steps.password, 'typed is not verified');
  assert.equal(advance(step, 'password', { pillar: open, verified: 'true' }), steps.password, 'only true');
  step = advance(step, 'password', { pillar: open, verified: true });
  assert.equal(step, steps.confirm);
  assert.equal(advance(step, 'cancel', { pillar: open }), steps.idle);
  assert.equal(advance(step, 'confirmed', { pillar: open }), steps.send);
});

test('revoke: no sequence of events reaches send without both steps', () => {
  const { steps, advance } = guard;
  // Every sequence of up to five events, with any context.
  const contexts = [{ pillar: open }, { pillar: open, verified: true }, { pillar: shut, verified: true }, {}];
  const walk = (step, seen, depth) => {
    if (step === steps.send) {
      assert.ok(seen.verified && seen.confirmed, 'send reached without password and confirmation');
      return;
    }
    if (depth === 0) return;
    for (const event of events) for (const context of contexts) {
      const next = advance(step, event, context);
      walk(next, {
        verified: seen.verified || (step === steps.password && next === steps.confirm && context.verified === true),
        confirmed: seen.confirmed || (step === steps.confirm && event === 'confirmed'),
      }, depth - 1);
    }
  };
  walk(steps.idle, { verified: false, confirmed: false }, 5);
  assert.equal(advance(steps.idle, 'press', { pillar: shut }), steps.idle, 'closed window');
  assert.equal(advance(steps.idle, 'press', {}), steps.idle, 'no pillar');
  assert.equal(advance(steps.idle, 'confirmed', { pillar: open }), steps.idle, 'cannot skip to the end');
  assert.equal(advance(steps.confirm, 'confirmed', { pillar: shut }), steps.idle, 'window shut meanwhile');
});

//
// APR and sorting
//
test('the minted ZNN per epoch follows go-zenon\'s ticks', () => {
  // NetworkZnnRewardConfig: {10,6,5,7,5,4,7,4,3,7,3} x MomentumsPerEpoch / 6
  assert.equal(apr.epochZnn(0), 14400);
  assert.equal(apr.epochZnn(29), 14400);
  assert.equal(apr.epochZnn(30), 8640);
  assert.equal(apr.epochZnn(300), 4320);
  assert.equal(apr.epochZnn(10000), 4320);
  assert.equal(apr.epochZnn(null), 4320);
});

const devnet = [ // shaped like embedded.pillar.getAll on devnet, 2026-10-11
  { name: 'dev1', weight: '54090100000000', giveMomentumRewardPercentage: 0, giveDelegateRewardPercentage: 100, currentStats: { producedMomentums: 99, expectedMomentums: 100 } },
  { name: 'dev2', weight: '36012800000000', giveMomentumRewardPercentage: 0, giveDelegateRewardPercentage: 100, currentStats: { producedMomentums: 99, expectedMomentums: 100 } },
  { name: 'dev3', weight: '20000000000', giveMomentumRewardPercentage: 50, giveDelegateRewardPercentage: 100, currentStats: { producedMomentums: 10, expectedMomentums: 10 } },
];

test('delegator APR: the contract\'s split, over the pillar\'s weight', () => {
  const totals = apr.networkTotals(devnet);
  assert.equal(totals.count, 3);
  // 24% of 4,320 ZNN a day to all delegated weight, at full uptime and full share: 365 x 1036.8 / total.
  const ceiling = (4320 * 0.24 * 365) / totals.weight * 100;
  const one = apr.delegatorApr(devnet[0], totals, 400);
  assert.ok(Math.abs(one - ceiling * 0.99) < 1e-9, `${one} vs ${ceiling * 0.99}`);
  assert.equal(apr.delegatorApr({ ...devnet[0], giveDelegateRewardPercentage: 0 }, totals, 400), 0);
  assert.equal(apr.delegatorApr({ ...devnet[0], weight: '0' }, totals, 400), null);
  assert.ok(apr.delegatorApr(devnet[2], totals, 400) > 1000, 'a tiny pillar sharing momentum rewards');
  assert.equal(apr.formatApr(41.567), '41.6%');
  assert.equal(apr.formatApr(150.4), '150%');
  assert.equal(apr.formatApr(5000), '>999%');
  assert.equal(apr.formatApr(null), null);
});

test('Delegate sorts: highest first, unknowns last, ties stable', () => {
  const context = { totals: apr.networkTotals(devnet), epoch: 400 };
  const names = (key) => sortPillars(devnet, key, context).map((p) => p.name);
  assert.deepEqual(names('weight'), ['dev1', 'dev2', 'dev3']);
  assert.deepEqual(names('name'), ['dev1', 'dev2', 'dev3']);
  assert.deepEqual(names('apr'), ['dev3', 'dev1', 'dev2'].sort((a, b) =>
    apr.delegatorApr(devnet.find((p) => p.name === b), context.totals, 400) - apr.delegatorApr(devnet.find((p) => p.name === a), context.totals, 400)));
  assert.deepEqual(names('produced'), ['dev3', 'dev1', 'dev2'], '100% first, then a tie broken by weight');
  const idle = { name: 'dev0', weight: '1', giveDelegateRewardPercentage: 100, currentStats: { producedMomentums: 0, expectedMomentums: 0 } };
  assert.equal(sortPillars([idle, ...devnet], 'produced', context)[3].name, 'dev0', 'no slots yet goes last');
  assert.equal(sortPillars(devnet, 'apr', {}).length, 3, 'no totals yet still lists every pillar');
  assert.deepEqual(sortChoices.map((c) => c.key), ['weight', 'apr', 'produced', 'shared', 'name']);
  assert.notEqual(sortPillars(devnet, 'weight', context), devnet, 'a copy, not the list it was given');
});

//
// Settings: Modes and Wallet fold
//
test('settings: Extension starts open, Modes and Wallet closed, and a closed section is hidden, not removed', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/settings/settings/settings.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.deepEqual([...page.matchAll(/fold\(\{\s+id: '(\w+)',\s+title: '(\w+)'/g)].map((m) => [m[1], m[2]]), [['extension', 'Extension'], ['modes', 'Modes'], ['wallet', 'Wallet']]);
  // The heading is a button that says what it controls and whether it is open.
  assert.ok(page.includes('aria-expanded={open} aria-controls={`settings-${id}`} onClick={onToggle}'));
  // The body stays in the tree (utils/session-policy-test.js presses the lock
  // choices without opening anything) and out of sight.
  assert.ok(page.includes('<div className="fold-body" id={`settings-${id}`} hidden={!open}>'));
  assert.ok(!/open\.(extension|modes|wallet) &&/.test(page), 'a section is not left out when closed');
  assert.ok(page.includes("return { extension: value?.extension !== false, modes: value?.modes === true, wallet: value?.wallet === true };"), 'Extension open unless it was closed, the others closed unless opened');
  assert.ok(page.includes("return { extension: true, modes: false, wallet: false };"));
  // Nothing on the page is outside a section.
  const beforeFirst = page.slice(page.indexOf('<div className="page">'), page.indexOf("id: 'extension'"));
  assert.ok(!/SettingsItem|settings-item|setting-row|className="button/.test(beforeFirst), 'no ungrouped option');
  // Every switch and choice is inside one of the two sections.
  const walletBody = page.slice(page.indexOf("id: 'wallet'"));
  for (const control of ['Receive automatically', 'Lock after']) assert.ok(walletBody.includes(control), control);
  for (const moved of ['Explorer', 'Theme']) assert.ok(!walletBody.includes(`>${moved}<`), `${moved} is among the links now`);
  // The wallet's own phrase, password and removal are in its section too
  // (owner, 2026-10-11), and the links anyone uses sit above both sections.
  for (const own of ['title="Backup phrase"', 'title="Password"', "navigate('reset-wallet')"]) {
    assert.ok(walletBody.includes(own), own);
    assert.ok(!page.slice(0, page.indexOf("id: 'wallet'")).includes(own), `${own} only in Wallet`);
  }
  const aboveModes = page.slice(page.indexOf('<div className="page">'), page.indexOf("id: 'modes'"));
  // Links and the two choices among them, in the owner's order.
  assert.deepEqual([...aboveModes.matchAll(/<SettingsItem icon="[a-z-]+" title="([^"]+)"|className="settings-item-title">([^<]+)</g)].map((m) => m[1] || m[2]),
    ['Node', 'Explorer', 'Connected sites', 'Zap a random alien', 'Sign message', 'Theme', 'About']);
  // The explorer's choices are named short enough for the row, and each has a name.
  const { explorerChoices } = load('src/services/utils/explorer.js', cache);
  for (const choice of explorerChoices) assert.ok(choice.short && choice.short.length <= 14, choice.key);
  assert.ok(aboveModes.includes('explorerChoices.map((choice) => ({ key: choice.key, label: choice.short }))'));
  assert.ok(aboveModes.includes("onChange: (key) => update('explorer', key),") && aboveModes.includes("onChange: (key) => update('theme', key),"));
  assert.ok(!page.includes('node-stats'), 'Node stats is reached from the Node page');
  const modesBody = page.slice(page.indexOf("id: 'modes'"), page.indexOf("id: 'wallet'"));
  assert.ok(modesBody.includes('modes.map((mode) => ('));
  // The hidden attribute has to win over the body's own display.
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(css, /\.fold-body \{[^}]*display: flex;[^}]*&\[hidden\] \{\s*display: none;\s*\}/);
  assert.match(css, /\.fold-toggle\[aria-expanded='true'\] \.fold-chevron \{\s*rotate: 90deg;/);
});

//
// Sporks
//
test('spork administrators: genesis per chain, community only on mainnet inside a window', () => {
  const devAdmin = 'z1qq9n7fpaqd8lpcljandzmx4xtku9w4ftwyg0mq';
  assert.equal(spork.sporkRole({ address: devAdmin, chainIdentifier: 69, height: 1 }), 'genesis');
  assert.equal(spork.sporkRole({ address: devAdmin, chainIdentifier: 1, height: 1 }), null, 'another chain\'s admin');
  assert.equal(spork.sporkRole({ address: 'z1qpxswrfnlll355wrx868xh58j7e2gu2n2u5czv', chainIdentifier: 1 }), 'genesis');
  assert.equal(spork.sporkRole({ address: a1, chainIdentifier: 69, height: 1 }), null);
  const community = spork.communityAddress;
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 1, height: 13243711 }), 'community');
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 1, height: 13243712 }), null, 'first window closed');
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 1, height: 14567887 }), 'community', 'second window');
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 1, height: 19791986 }), null);
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 69, height: 15000000 }), null, 'mainnet only');
  assert.equal(spork.sporkRole({ address: community, chainIdentifier: 1, height: null }), null, 'unknown height');
});

test('sporks: go-zenon\'s limits, states and call data', () => {
  assert.equal(spork.sporkError({ name: 'abcde', description: '' }), null);
  assert.ok(spork.sporkError({ name: 'abcd', description: '' }), 'five at least');
  assert.ok(spork.sporkError({ name: 'x'.repeat(41), description: '' }));
  assert.ok(spork.sporkError({ name: 'abcde', description: 'x'.repeat(401) }));
  assert.equal(spork.sporkState({ activated: false }, 100), 'inactive');
  assert.equal(spork.sporkState({ activated: true, enforcementHeight: 106 }, 100), 'activating');
  assert.equal(spork.sporkState({ activated: true, enforcementHeight: 106 }, 106), 'active');
  const create = spork.templates.create({ name: 'abcde', description: 'd' });
  assert.equal(hex(create).slice(0, 8), sha3_256('CreateSpork(string,string)').slice(0, 8));
  assert.equal(create.toAddress.toString(), spork.sporkAddress);
  assert.equal(create.amount.toString(), '0');
  const id = '00'.repeat(31) + '03';
  const activate = spork.templates.activate(id);
  assert.equal(hex(activate), sha3_256('ActivateSpork(hash)').slice(0, 8) + id);
});

// znnd exits on an activated spork it does not implement, and a spork cannot be
// deactivated: one activated from this wallet as a test halted the devnet.
test('sporks: an id znnd does not implement is activated only by typing its name', () => {
  const goZenon = [
    '6d2b1e6cb4025f2f45533f0fe22e9b7ce2014d91cc960471045fa64eee5a6ba3',
    'ceb7e3808ef17ea910adda2f3ab547be4cdfb54de8400ce3683258d06be1354b',
    'ddd43466769461c5b5d109c639da0f50a7eeb96ad6e7274b1928a35c431d7b1b',
  ];
  assert.deepEqual(Object.keys(spork.implementedSporks).sort(), [...goZenon].sort(), 'common/types/spork.go');
  for (const id of goZenon) {
    assert.equal(spork.activationGate(id), 'confirm');
    assert.equal(spork.activationGate(id.toUpperCase()), 'confirm');
    assert.equal(spork.mayActivate({ id, name: 'abcde' }, ''), true);
  }
  const halted = { id: '716478e346a7c0c82b42d598627104f463b48b6bb83341d906d1261c42e1124f', name: 'syrius-test' };
  assert.equal(spork.activationGate(halted.id), 'name', 'the spork that halted chain 69');
  assert.equal(spork.mayActivate(halted, ''), false);
  assert.equal(spork.mayActivate(halted, 'syrius-tes'), false);
  assert.equal(spork.mayActivate(halted, 'Syrius-test'), false, 'exact');
  assert.equal(spork.mayActivate(halted, 'syrius-test'), true);
  for (const id of ['constructor', 'toString', '__proto__', '', undefined, null]) {
    assert.equal(spork.activationGate(id), 'name', String(id));
    assert.equal(spork.mayActivate({ id, name: '' }, ''), false, 'an empty name is not a match');
  }
  // The page asks the service, and sends only through the gated dialog.
  const page = fs.readFileSync(path.join(root, 'src/pages/settings/sporks/sporks.js'), 'utf8');
  assert.equal(page.split('templates.activate(').length, 2, 'one place sends ActivateSpork');
  const squeezed = page.replace(/\s+/g, ' ');
  assert.ok(squeezed.includes('<ActivateConfirm spork={spork} onSuccess={() => send(templates.activate(spork.id)'));
  assert.ok(squeezed.includes('confirmDisabled={!mayActivate(spork, typed)}'));
  assert.ok(squeezed.includes('onSuccess={() => mayActivate(spork, typed) && onSuccess()}'));
});

//
// The redesign's standing rules
//
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const source = files(path.join(root, 'src')).filter((file) => /\.(js|jsx|scss|css|html)$/.test(file));

test('no reduced-motion rule anywhere', () => {
  for (const file of source) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/prefers-reduced-motion\s*:/.test(text), path.relative(root, file));
  }
});

test('nothing in the popup is fetched from a CDN', () => {
  const pattern = /(fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg|cdn\.tailwindcss)/;
  for (const file of source) assert.ok(!pattern.test(fs.readFileSync(file, 'utf8')), path.relative(root, file));
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8');
  for (const [, url] of css.matchAll(/url\(['"]?([^'")]+)/g)) assert.ok(!/^https?:/.test(url), url);
  for (const font of ['space-grotesk.woff2', 'jetbrains-mono.woff2', 'space-grotesk-LICENSE.txt', 'jetbrains-mono-LICENSE.txt']) {
    assert.ok(fs.existsSync(path.join(root, 'src/assets/fonts', font)), font);
  }
});

test('colours live in the token blocks, defined for dark and light', () => {
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8').replace(/\r\n/g, '\n');
  const dark = css.match(/\n:root \{\n([\s\S]*?)\n\}/)[1];
  const light = css.match(/\n:root\[data-theme='light'\] \{\n([\s\S]*?)\n\}/)[1];
  const outside = css.replace(dark, '').replace(light, '');
  assert.deepEqual(outside.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) || [], [], 'raw colour outside the tokens');
  const names = (block) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
  const colourish = /background|card|popover|hover|border|foreground|primary|success|info|warning|destructive|scrim|ring|shadow/;
  for (const name of names(dark)) if (colourish.test(name)) assert.ok(names(light).has(name) || /^--(plasma|highlight|pending|primary-foreground)$/.test(name), `${name} has no light value`);
  assert.equal(resolveTheme('light'), 'light');
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('nonsense'), 'dark');
});

test('enter animations start above, so a page never overflows while it arrives', () => {
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8');
  for (const name of ['page-in', 'item-in']) {
    const block = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
    const y = block.match(/translate:\s*0\s+(-?\d+)px/);
    assert.ok(y && Number(y[1]) <= 0, `${name} moves up into place`);
  }
});

test('lock and welcome screens: the animated mark, and the node button on both', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const css = read('src/sections/Popup/Popup.scss');
  for (const file of ['src/pages/dashboard/dashboard-password/dashboard-password.js', 'src/pages/onboarding/onboarding.js']) {
    const page = read(file);
    assert.ok(page.includes('<MenuHeader changeNodeButton />'), `${file}: the node can be chosen before unlocking`);
    assert.ok(page.includes('className="brand-mark-ring" aria-hidden="true"') && page.includes('className="brand-mark-pulse" aria-hidden="true"'), file);
  }
  for (const name of ['mark-drift', 'mark-pulse', 'field-refuse']) assert.ok(css.includes(`@keyframes ${name} {`), name);
  // The pulse and the drift never push the page: they grow within the mark's
  // own box and move up, not down.
  assert.match(css, /@keyframes mark-drift \{\s+50% \{\s+translate: 0 -2px;/);
  const grow = Number(css.match(/@keyframes mark-pulse[\s\S]*?scale: (1\.\d+);/)[1]);
  assert.match(css, /\.brand-mark \{[^}]*width: 128px;\s+height: 128px;/);
  assert.ok((128 - 16) * grow <= 128, 'the pulse stays inside the 128px mark');
  // The lock screen is the flex item beside the header: a min-height of 100%
  // on it made the page taller than the popup by the header, and it scrolled.
  for (const rule of css.matchAll(/\n\.unlock-screen \{([^}]*)\}/g)) assert.ok(!/min-height|(^|\s)height:/.test(rule[1]), 'no height forced on the lock screen');
  // Unlocked: one fast turn, under half a second, and the screen waits exactly
  // that long before the wallet takes it.
  const lock = read('src/pages/dashboard/dashboard-password/dashboard-password.js');
  const openedFor = Number(lock.match(/const openedFor = (\d+);/)[1]);
  assert.ok(openedFor > 0 && openedFor < 500, 'less than half a second');
  const opened = css.match(/\n\.brand-mark\.is-open \{([\s\S]*?)\n\}/)[1];
  assert.ok(opened.includes(`animation: mark-open ${openedFor}ms $ease-out 1 both;`));
  assert.ok(opened.includes(`mark-lift ${openedFor}ms $spring 1 both;`));

  // The light is never restarted: no state gives the ring another animation
  // or another duration, so a wrong password or an unlock carries on from
  // wherever it was. Its speed is set from the page instead.
  const ringRules = [...css.matchAll(/\n(\.brand-mark[^\n{]*) \{([^{}]*)\}/g)].filter((rule) => /brand-mark-ring/.test(rule[1]) || rule[1] === '.brand-mark.is-open');
  const ringAnimations = css.match(/\n\.brand-mark-ring \{[\s\S]*?\n\}/)[0].match(/animation[a-z-]*:/g);
  assert.deepEqual(ringAnimations, ['animation:'], 'one animation on the ring, and no duration override');
  assert.ok(!/\.brand-mark-ring \{[^}]*animation/.test(opened), 'opening does not replace it');
  assert.ok(!css.includes('.brand-mark.is-busy'), 'no state restarts it');
  assert.ok(ringRules.length >= 0);
  // Checking a password does not touch the light at all; only success does.
  assert.ok(!/playbackRate|ringRate|isUnlocking\]\)/.test(lock), 'nothing speeds the light up while unlocking');
  assert.match(lock, /useEffect\(\(\) => \{\s+if \(isOpen\) spinOnce\(ring\.current, openedFor\);\s+\}, \[isOpen\]\);/);

  // The light's pace varies: the stylesheet carries the generated steps
  // exactly, it never runs backwards, and a turn ends at the pace it began.
  const turn = require(path.join(root, 'tools/pillar/edge-turn-keyframes.js'));
  assert.ok(css.includes(turn.css), 'Popup.scss holds the generated edge-turn keyframes');
  assert.equal(css.split('@keyframes edge-turn {').length, 2);
  const paces = [];
  for (let step = 1; step <= turn.steps; step += 1) paces.push((turn.angle(step / turn.steps) - turn.angle((step - 1) / turn.steps)) / (360 / turn.steps));
  assert.ok(Math.min(...paces) > 0.3, 'never stops or runs backwards');
  assert.ok(Math.max(...paces) < 1.7 && Math.max(...paces) / Math.min(...paces) > 2, 'the pace really varies');
  assert.ok(Math.abs(paces[0] - paces[paces.length - 1]) < 0.02, 'no seam where the turn repeats');
  assert.ok(Math.abs(turn.angle(1) - 360) < 1e-9 && turn.angle(0) === 0);
  for (const use of css.matchAll(/animation: edge-turn [^;]+;/g)) assert.equal(use[0], 'animation: edge-turn 12s linear infinite;');

  // The light's position comes from the clock, so a remount carries on.
  const light = load('src/services/utils/edgeLight.js', cache);
  assert.equal(light.period, 12000);
  assert.equal(light.ringPeriod, 36000);
  assert.ok(css.match(/\n\.brand-mark-ring \{[\s\S]*?\n\}/)[0].includes('animation: ring-green 36s linear infinite, ring-blue 36s linear infinite;'));
  const ringStyle = {};
  const now0 = performance.now;
  performance.now = () => 36000 * 2 + 30500;
  try { light.ringInPhase({ style: ringStyle }); } finally { performance.now = now0; }
  assert.equal(ringStyle.animationDelay, '-30500ms', 'the ring starts where the clock says, over its own 36 s');

  // The ring's two lights: each always moves forward at a changing pace, and
  // each closes on the other in turn, to 30 degrees and no nearer.
  assert.ok(css.includes(turn.ringCss), 'Popup.scss holds the generated ring keyframes');
  const gaps = [];
  for (let step = 0; step <= turn.ring.steps; step += 1) {
    const p = step / turn.ring.steps;
    gaps.push((((turn.blue(p) - turn.green(p)) % 360) + 360) % 360);
    if (step) {
      for (const curve of [turn.green, turn.blue]) {
        const pace = (curve(p) - curve((step - 1) / turn.ring.steps)) / (360 * turn.ring.turns / turn.ring.steps);
        assert.ok(pace > 0.5 && pace < 1.5, `pace ${pace}`);
      }
    }
  }
  assert.ok(Math.abs(Math.min(...gaps) - 30) < 0.5, 'blue is nearly caught by green');
  assert.ok(Math.abs(Math.max(...gaps) - 330) < 0.5, 'and green by blue');
  assert.ok(Math.abs(gaps[0] - 180) < 1e-9 && Math.abs(gaps[gaps.length - 1] - 180) < 1e-9, 'the loop closes where it began');
  assert.equal(turn.green(1) - turn.green(0), 1080);
  assert.equal(turn.blue(1) - turn.blue(0), 1080);
  // The extra turn on unlocking moves both lights by the same time.
  const edgeSource = read('src/services/utils/edgeLight.js');
  assert.ok(edgeSource.includes("const lights = ['edge-turn', 'ring-green', 'ring-blue'];"));
  assert.ok(edgeSource.includes('animations.forEach((animation, index) => { animation.currentTime = from[index] + ahead; });'));
  assert.equal(light.phaseAt(0), 0);
  assert.equal(light.phaseAt(12000 * 7 + 4321), 4321);
  const style = {};
  const realNow = performance.now;
  performance.now = () => 12000 * 3 + 2500;
  try { light.inPhase({ style }); } finally { performance.now = realNow; }
  assert.equal(style.animationDelay, '-2500ms', 'starts where the clock says');
  light.inPhase(null);
  // The extra turn: nothing at the start, a whole turn at the end (in phase
  // again), never backwards, and no sudden start.
  assert.equal(light.extraTurn(0), 0);
  assert.equal(light.extraTurn(1), 12000);
  assert.equal(light.extraTurn(2), 12000);
  let last = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) { const now = light.extraTurn(p); assert.ok(now >= last - 1e-9); last = now; }
  assert.ok(light.extraTurn(0.01) < 12000 * 0.001, 'eases in');
  assert.ok(12000 - light.extraTurn(0.99) < 12000 * 0.001, 'eases out');
  for (const [file, mark] of [
    ['src/pages/dashboard/dashboard/dashboard.js', '<section className="balance-card" ref={inPhase}>'],
    ['src/pages/onboarding/onboarding.js', '<span className="brand-mark-ring" aria-hidden="true" ref={ringInPhase} />'],
    ['src/pages/dashboard/dashboard-password/dashboard-password.js', '<span className="brand-mark-ring" aria-hidden="true" ref={setRing} />'],
  ]) assert.ok(read(file).includes(mark), file);
  assert.match(lock, /const setRing = useCallback\(\(element\) => \{\s+ring\.current = element;\s+ringInPhase\(element\);\s+\}, \[\]\);/);
  // The colours fade, they do not switch.
  assert.match(css, /@property --ring-rest \{\s+syntax: '<color>';/);
  assert.match(css, /transition: --ring-rest 220ms \$ease-out, --ring-far 220ms \$ease-out;/);
  // The drift comes first wherever the logo gets a second animation, so it is not restarted either.
  for (const rule of css.matchAll(/\.brand-mark[.a-z-]* img \{\s+animation: ([^;]+);/g)) assert.ok(rule[1].startsWith('mark-drift 6s ease-in-out infinite, '), rule[1]);
  // A wrong password shakes the logo.
  assert.match(css, /\.brand-mark\.is-refused img \{\s+animation: mark-drift 6s ease-in-out infinite, mark-refuse 360ms/);
  assert.ok(lock.includes("isOpen ? 'is-open' : wrongPassword ? 'is-refused' : ''"));
  assert.match(lock, /await completeUnlock\(\{ walletName, password: walletPassword, dispatch \}\);\s+setIsOpen\(true\);\s+await new Promise\(\(resolve\) => \{ setTimeout\(resolve, openedFor\); \}\);\s+navigate\(returnTo/);
  assert.equal(lock.split('setIsOpen(true)').length, 2, 'only a successful unlock shows it');
  // The button answers with a tick and the form clears, all inside the wait.
  assert.ok(lock.includes('{isOpen && <Icon name="check" size={16} className="unlock-check" />}'));
  assert.ok(lock.includes("unlock-screen ${isOpen ? 'is-open' : ''}"));
  const clear = css.match(/\.unlock-screen\.is-open > :not\(\.brand-mark\) \{\s+animation: unlock-clear (\d+)ms ease-in (\d+)ms both;/);
  assert.ok(Number(clear[1]) + Number(clear[2]) <= openedFor, 'cleared before the wallet takes the screen');
  assert.match(css, /@keyframes unlock-clear \{\s+to \{\s+opacity: 0;\s+translate: 0 -4px;/, 'up, never down');
  // The ring is the balance card's edge: the same gradient, turned the same way.
  const ring = css.match(/\n\.brand-mark-ring \{([\s\S]*?)\n\}/)[1];
  const card = [...css.matchAll(/\n\.balance-card \{([\s\S]*?)\n\}/g)].map((rule) => rule[1]).find((rule) => rule.includes('--edge-angle'));
  const stops = (text) => text.match(/from var\(--edge-angle\),([\s\S]*?)\)\s*(;|border-box)/)[1].replace(/\s+/g, ' ').trim();
  // The ring carries the card's two colours, as two lights of its own.
  assert.ok(stops(card).includes('var(--primary)') && stops(card).includes('var(--info)'));
  assert.ok(ring.includes('--ring-rest: var(--border);') && ring.includes('--ring-far: color-mix(in srgb, var(--info) 75%, transparent);'));
  assert.ok(ring.includes('from var(--ring-green-at),') && ring.includes('conic-gradient(from var(--ring-blue-at), var(--ring-far),'));
  assert.ok(card.includes('animation: edge-turn 12s linear infinite;'));
  assert.ok(!/animation: spin/.test(ring), 'the light turns, the element does not');
});

test('plasma: a whole address fits the recipient field', () => {
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8').replace(/\r\n/g, '\n');
  const page = fs.readFileSync(path.join(root, 'src/pages/plasma/plasma.js'), 'utf8');
  const field = css.match(/\n\.address-input \{([\s\S]*?)\n\}/)[1];
  assert.ok(field.includes('font-family: var(--font-mono);'), 'an identifier is set in the data face');
  const size = Number(field.match(/font-size: (\d+)px;/)[1]);
  // JetBrains Mono is 0.6 em wide. The field is 336px less its border and 12px of padding each side.
  assert.ok(40 * size * 0.6 <= 336 - 2 - 24, `40 characters at ${size}px`);
  assert.match(css, /\.input-with-button\.is-full \.custom-label \{\s+padding-right: 12px;/);
  // The chip leaves the field before an address would run under it, and the way back to one's own address stays.
  const room = Number(page.match(/const chipRoom = (\d+);/)[1]);
  assert.ok(room * size * 0.6 <= 336 - 2 - 12 - 62, 'what fits beside the chip');
  assert.ok(page.includes("{!chipFits && recipient.trim() !== address && ("));
  assert.ok(page.includes('className={`w-100 custom-label address-input ${'));
});

test('delegate: the sort choices fit the row, none is hidden off its edge', () => {
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8').replace(/\r\n/g, '\n');
  const row = css.match(/\n\.sort-row \{([\s\S]*?)\n\}/)[1];
  assert.ok(!/overflow-x|scrollbar-width|::-webkit-scrollbar/.test(row), 'the row does not scroll sideways');
  assert.ok(row.includes('flex-wrap: wrap;'));
  const chip = css.match(/\n\.sort-chip \{([\s\S]*?)\n\}/)[1];
  assert.ok(chip.includes('flex: 1 1 auto;'), 'the choices share the width');
  // Five labels at 12px in a 336px row: about 7px a character is generous.
  const { sortChoices } = load('src/services/pillar/sort.js', cache);
  const padding = Number(chip.match(/padding: 4px (\d+)px;/)[1]);
  const gap = Number(row.match(/gap: (\d+)px;/)[1]);
  const needed = sortChoices.reduce((sum, choice) => sum + choice.label.length * 7 + padding * 2 + 2, 0) + gap * (sortChoices.length - 1);
  assert.ok(needed <= 336, `${needed}px needed of 336`);
});

test('the plasma fill is the primary button\'s alone', () => {
  const css = fs.readFileSync(path.join(root, 'src/sections/Popup/Popup.scss'), 'utf8');
  const uses = [...css.matchAll(/var\(--plasma\)/g)].length;
  assert.equal(uses, 2, '--btn-bg and its hover, on .primary');
});

console.log(`pillar-mode-test: ${passed} passed`);
