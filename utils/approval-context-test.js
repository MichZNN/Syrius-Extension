'use strict';
// Actual presentation/modal modules with inert state and callbacks. No wallet,
// storage, SDK, browser profile or network endpoint is accessed.
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..'), cache = new Map();
const state = { connectionParameters: { chainIdentifier: 1, nodeUrl: 'wss://fixture-user:fixture-value@node.fixture.invalid:35998/private-route?fixture=hidden#detail' } };
const ModalContext = React.createContext({ closeModal() {} });
const load = file => {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const { code } = babel.transformFileSync(filename, {
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }], ['@babel/preset-react', { runtime: 'classic' }]],
    configFile: false, babelrc: false,
  });
  const resolve = id => {
    if (id === 'react-redux') return { useSelector: select => select(state) };
    if (id.endsWith('/hooks/modal/modalContext')) return { ModalContext };
    if (id.endsWith('.svg')) return 'inert-icon.svg';
    if (!id.startsWith('.')) return require(id);
    const target = path.resolve(path.dirname(filename), id);
    return load(path.extname(target) ? target : target + '.js');
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, resolve);
  return module.exports;
};
const TransactionNetwork = load('src/components/transaction-network/transaction-network.js').default;
const AlertModal = load('src/components/modals/alert-modal.js').default;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

// The wallet's own confirmations name neither the signing chain nor the node
// (owner, 2026-10-11): the header chip does. Only a site's request shows them.
for (const type of ['confirm', 'warning', 'danger']) {
  const html = render(AlertModal, { type, transaction: true, title: 'Inert transaction confirmation', children: 'Reviewed action' });
  for (const absent of ['Selected signing chain', 'Node host', 'transaction-network', 'node.fixture.invalid']) assert(!html.includes(absent), absent);
  assert(html.includes('Reviewed action'));
}
const fs = require('node:fs');
const sources = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sources(dir + '/' + entry.name) : entry.name.endsWith('.js') ? [dir + '/' + entry.name] : []);
assert.deepEqual(sources('src').filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes('transaction-network/transaction-network')),
  ['src/layouts/siteIntegrationLayout/siteIntegrationLayout.js'], 'only the approval window draws the network details');
const selected = render(TransactionNetwork, { chainIdentifier: 1, nodeUrl: state.connectionParameters.nodeUrl });
assert.match(selected, /Selected signing chain<\/dt><dd class="word-break-all">1<\/dd>/);
assert(selected.includes('wss://node.fixture.invalid:35998'));
for (const privatePart of ['fixture-user', 'fixture-value', '/private-route', 'fixture=hidden', '#detail']) assert(!selected.includes(privatePart));
assert(!selected.includes('Effective block chain'));
state.connectionParameters = { chainIdentifier: 69, nodeUrl: 'ws://node.fixture.invalid:1234' };
const matching = render(TransactionNetwork, { chainIdentifier: 69, nodeUrl: state.connectionParameters.nodeUrl, effectiveChainIdentifier: 69 });
assert(matching.includes('Effective block chain')); assert(!matching.includes('different chain identifier'));
const unavailable = render(TransactionNetwork, { chainIdentifier: undefined, nodeUrl: 'invalid' });
assert.match(unavailable, /Selected signing chain<\/dt><dd class="word-break-all">Unavailable<\/dd>/);
assert.match(unavailable, /Node host<\/dt><dd class="word-break-all">Unavailable<\/dd>/);
const invalid = render(TransactionNetwork, { chainIdentifier: 1, effectiveChainIdentifier: { unsupported: true } });
assert(invalid.includes('Invalid chain identifier'), 'malformed raw chain metadata cannot crash rendering');
console.log('Approval context: native confirmations without network details, explicit prepared chain, endpoint redaction and unavailable states passed');
