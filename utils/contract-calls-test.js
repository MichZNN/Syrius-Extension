/**
 * Run focused regression checks for the security boundary and history decoder.
 *
 * The application source uses Babel modules, while this small harness runs
 * directly under Node.js 24. It transpiles only the modules under test and
 * resolves their relative imports in memory, so it does not create generated
 * files or require a browser session.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

global.atob = global.atob || ((value) => Buffer.from(value, 'base64').toString('binary'));

const moduleCache = new Map();

const resolveSource = (request, parentFilename) => {
  const base = path.resolve(path.dirname(parentFilename), request);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')];
  const filename = candidates.find((candidate) => fs.existsSync(candidate));

  if (!filename) {
    throw new Error(`Cannot resolve ${request} from ${parentFilename}`);
  }

  return filename;
};

const loadSource = (relativeFilename) => {
  const filename = path.resolve(__dirname, '..', relativeFilename);
  if (moduleCache.has(filename)) {
    return moduleCache.get(filename).exports;
  }

  const source = babel.transformFileSync(filename, {
    presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    babelrc: false,
    configFile: false,
  }).code;
  const module = { exports: {} };
  moduleCache.set(filename, module);

  const localRequire = (request) => {
    if (!request.startsWith('.')) {
      return require(request);
    }

    return loadSource(path.relative(path.resolve(__dirname, '..'), resolveSource(request, filename)));
  };

  // The transformed files are application code; no user-controlled source is
  // evaluated by this test harness.
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', source)(module, module.exports, localRequire);
  return module.exports;
};

const amounts = loadSource('src/services/security/amounts.js');
const bridgeValidation = loadSource('src/services/security/bridgeValidation.js');
const providerValidation = loadSource('src/services/security/providerValidation.js');
const contracts = loadSource('src/services/utils/contracts.js');
const contractCalls = loadSource('src/services/utils/contractCalls.js');
const networkDefaults = loadSource('src/services/utils/networkDefaults.js');
const sessionEntropy = loadSource('src/services/security/sessionEntropy.js');

const transactionParams = {
  amount: '435000000',
  to: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
};

assert.equal(amounts.parseTokenAmount('4.35', 8), 435000000);
assert.equal(amounts.formatTokenAmount('435000000', 8), '4.35');
assert.equal(amounts.isSufficientRawTokenBalance('435000000', '435000000'), true);
assert.equal(amounts.isSufficientRawTokenBalance('434999999', '435000000'), false);
assert.equal(amounts.parseTokenAmount('4.350000001', 8), null);
assert.equal(amounts.parseTokenAmount('4e0', 8), null);
assert.equal(amounts.parseSafeRawTokenAmount('9007199254740992'), null);

assert.equal(sessionEntropy.isValidSessionEntropy('00'.repeat(16)), true);
assert.equal(sessionEntropy.isValidSessionEntropy('00'.repeat(32)), true);
assert.equal(sessionEntropy.isValidSessionEntropy('00'.repeat(15)), false);
assert.equal(sessionEntropy.isValidSessionEntropy(new Uint8Array(32)), false);

assert.equal(bridgeValidation.isValidBridgeRequest(
  'znn.sendTransactionToSigning',
  transactionParams,
), true);
assert.equal(bridgeValidation.isValidBridgeRequest(
  'znn.sendTransactionToSigning',
  { ...transactionParams, amount: '0' },
), false);
assert.equal(bridgeValidation.isValidBridgeRequest(
  'znn.sendTransactionToSigning',
  { ...transactionParams, extra: 'rejected' },
), false);
assert.equal(providerValidation.normalizeProviderMethod('eth_requestAccounts'), 'znn_connect');
assert.equal(providerValidation.isValidProviderRequest({
  id: 'znn-test-1',
  method: 'znn_sendTransaction',
  params: transactionParams,
}), true);
assert.equal(providerValidation.isValidProviderRequest({
  id: 'znn-test-2',
  method: 'znn_chainId',
  params: { unexpected: true },
}), false);

const blockDataFor = (signature) => Buffer.from(
  contractCalls.selectorOf(signature),
  'hex',
).toString('base64');

assert.equal(
  contractCalls.decodeCall('plasma', blockDataFor('Fuse(address)')),
  'Fuse',
);
assert.equal(contractCalls.describeCall('plasma', 'Fuse'), 'Fused');
assert.equal(
  contractCalls.decodeCall('htlc', blockDataFor('Unlock(hash,bytes)')),
  'Unlock',
);
assert.equal(contractCalls.decodeCall('htlc', ''), null);
assert.equal(
  contractCalls.decodeCall('htlc', Buffer.from('deadbeef', 'hex').toString('base64')),
  null,
);
assert.equal(contracts.embeddedContractName('z1qxemdeddedxplasma'), 'plasma');
assert.equal(contracts.embeddedContractName('z1normalaccount'), null);

assert.equal(networkDefaults.getDefaultChainIdForNode(networkDefaults.DEFAULT_TESTNET_NODE_URL), 3);
assert.equal(networkDefaults.isValidNodeUrl('ws://127.0.0.1:35998'), false);
assert.equal(networkDefaults.isValidNodeUrl(networkDefaults.DEFAULT_TESTNET_NODE_URL), true);

console.log('Security, provider, amount, network and contract-call checks passed.');
