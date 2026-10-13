'use strict';

// The background receiver page (src/sections/Background/receiver.js) is an
// offscreen document created for the WORKERS reason, which Chrome 112, the
// manifest's minimum, does not have (issue #43). There it must not be asked
// for, so the popup keeps doing the work; everywhere else it opens and closes
// with the timed unlock. The module is the real one; chrome is a stub.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const file = path.join(__dirname, '..', 'src/sections/Background/receiver.js');
const { code } = babel.transformFileSync(file, { presets: [['@babel/preset-env', { targets: { node: 'current' } }]], configFile: false, babelrc: false });

const load = ({ reasons, record }) => {
  const calls = [];
  const chrome = {
    runtime: { id: 'fixture', getURL: (name) => `chrome-extension://fixture/${name}`, onMessage: { addListener() {} } },
    storage: { session: { get: async () => ({ 'znn.unlock': record }) }, onChanged: { addListener() {} } },
    offscreen: {
      ...(reasons && { Reason: reasons }),
      createDocument: async (options) => {
        calls.push(['create', options.reasons.join()]);
        if (!reasons?.[options.reasons[0]]) throw new TypeError('Invalid enumeration value');
      },
      closeDocument: async () => { calls.push(['close']); },
    },
  };
  const sessionLease = { sessionKey: 'znn.unlock', live: (value) => Boolean(value?.live) };
  const module = { exports: {} };
  const require_ = (id) => { assert.equal(id, '../../services/wallet/sessionLease'); return { __esModule: true, default: sessionLease }; };
  vm.runInNewContext(code, { module, exports: module.exports, require: require_, chrome, process: { env: {} }, Promise });
  return { sync: module.exports.default, calls };
};

const timed = { live: true, mode: 'timed' };
const chrome113 = { WORKERS: 'WORKERS', BLOBS: 'BLOBS' };
const chrome112 = { BLOBS: 'BLOBS' };

(async () => {
  let passed = 0;
  const check = async (name, reasons, record, expected) => {
    const { sync, calls } = load({ reasons, record });
    await sync();
    assert.deepEqual(calls, expected, name);
    passed++;
  };
  await check('a timed unlock opens the page where WORKERS exists', chrome113, timed, [['create', 'WORKERS']]);
  await check('Chrome 112 is not asked for a page it cannot make', chrome112, timed, []);
  await check('an offscreen API with no Reason enum is not asked either', null, timed, []);
  await check('On close never opens one', chrome113, { live: true, mode: 'close' }, [['close']]);
  await check('a lock closes it', chrome113, undefined, [['close']]);
  await check('a lock closes it on Chrome 112 too', chrome112, undefined, [['close']]);
  console.log(`receiver fallback: opens for a timed unlock, never on Chrome 112, closes on lock: ${passed} passed`);
})().catch((error) => { console.error(error); process.exit(1); });
