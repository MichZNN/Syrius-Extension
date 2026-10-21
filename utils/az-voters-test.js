'use strict';
// Actual Voters component with controlled hooks and an inert read boundary.
// Checks ballot changes at a stable total and cancellation of stale reads;
// it is not a browser, native React renderer or live-chain fixture.
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const React = require('react');

const source = babel.transformFileSync(path.join(__dirname, '../src/pages/pillar/az.js'), {
  presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }],
    ['@babel/preset-react', { runtime: 'classic' }]], configFile: false, babelrc: false,
}).code;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixture = () => {
  const states = [], effects = [], commit = [], calls = [];
  let cursor = 0, writes = 0;
  const react = { ...React,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next) => { states[index] = next; writes++; }];
    },
    useEffect: (operation, deps) => {
      const index = cursor++, previous = effects[index];
      if (previous && deps.length === previous.deps.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return;
      previous?.cleanup?.();
      const entry = { deps: [...deps] }; effects[index] = entry;
      commit.push(() => { entry.cleanup = operation(); });
    },
  };
  const reads = { voters: (ids) => new Promise((resolve, reject) => calls.push({ ids, resolve, reject })) };
  const module = { exports: {} };
  const requireModule = (name) => {
    if (name === 'react') return react;
    if (name.endsWith('/pillar/calls')) return { reads };
    if (name.endsWith('/pillar/rules')) return { votes: { yes: 0, no: 1, abstain: 2 } };
    return {};
  };
  // Capture the private component in this fixture only, without a production export.
  new Function('module', 'exports', 'require', source + '\nmodule.exports.Voters = Voters;')(
    module, module.exports, requireModule);
  const render = (project) => {
    cursor = 0;
    const tree = module.exports.Voters({ project });
    while (commit.length) commit.shift()();
    return tree;
  };
  return { render, calls, state: () => states[0], writes: () => writes,
    unmount: () => effects.forEach((entry) => entry?.cleanup?.()) };
};
const project = () => ({ id: 'project', phaseIds: ['phase'], phases: [{ phase: { id: 'phase', name: 'Synthetic phase' },
  votes: { total: 1, yes: 1, no: 0 } }], votes: { total: 1, yes: 1, no: 0 } });
const ballots = (vote) => ({ project: [{ name: 'Synthetic pillar', vote }], phase: [{ name: 'Synthetic pillar', vote }] });

(async () => {
  for (const change of ['project', 'phase', 'unchanged-tallies']) {
    const f = fixture(), initial = project();
    f.render(initial);
    assert.deepEqual(f.calls[0].ids, ['project', 'phase']);
    f.calls[0].resolve(ballots(0)); await tick();
    f.render(initial);
    assert.equal(f.calls.length, 1, 'the same project object should not re-fetch');
    const next = { ...initial };
    if (change === 'project') next.votes = { total: 1, yes: 0, no: 1 };
    if (change === 'phase') next.phases = [{ ...initial.phases[0], votes: { total: 1, yes: 0, no: 1 } }];
    // Even identical aggregates can hide two pillars swapping their ballots.
    f.render(next);
    assert.equal(f.calls.length, 2, change + ': a refreshed project must refresh voters at a stable total');
    f.calls[1].resolve(ballots(1)); await tick();
    assert.deepEqual(f.state().byId, ballots(1));
    f.unmount();
  }
  // A slow previous read must not replace a newer project's voters, whether
  // that previous request eventually succeeds or fails.
  for (const stale of ['success', 'failure']) {
    const f = fixture(), initial = project();
    f.render(initial); f.render({ ...initial });
    assert.equal(f.calls.length, 2);
    f.calls[1].resolve(ballots(1)); await tick();
    if (stale === 'success') f.calls[0].resolve(ballots(0));
    else f.calls[0].reject(new Error('Synthetic obsolete read'));
    await tick();
    assert.deepEqual(f.state(), { byId: ballots(1) });
    f.unmount();
  }
  {
    const f = fixture(); f.render(project()); f.unmount();
    const before = f.writes();
    f.calls[0].resolve(ballots(0)); await tick();
    assert.equal(f.writes(), before);
  }
  {
    const f = fixture(), initial = project(); f.render(initial);
    f.calls[0].reject(new Error('Synthetic current read')); await tick();
    assert.deepEqual(f.state(), { error: true });
    f.render({ ...initial });
    f.calls[1].resolve(ballots(1)); await tick();
    assert.deepEqual(f.state(), { byId: ballots(1) }); f.unmount();
  }
  console.log('AZ voters: stable-total project/phase changes, identical aggregates, stable object, stale reads, unmount and recovery passed (7 cases).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
