#!/usr/bin/env node
// Sends ZNN on the lab chain from the devnet mnemonic's index 1, which holds
// the genesis fuses and so needs no proof of work, to another index of the
// same mnemonic. For a test that needs an account with coins and no plasma:
// the receive, and everything that account sends after, pays with proof of
// work in the wallet itself.
//
//   node tools/devnet/lab/fund.js <index> [znn, default 50]
//
// Lab only: it reads the chain from the node's frontier momentum and refuses
// anything but 321 (tools/devnet/lab/README.md). Prints the funded address
// and its plasma, and exits once the send is confirmed.
'use strict';
const url = process.env.LAB_WS || 'ws://127.0.0.1:45998';
const index = Number(process.argv[2]);
const amount = Number(process.argv[3] || 50);
if (!Number.isInteger(index) || index < 2) {
  console.error('usage: fund.js <index of 2 or more> [znn]');
  process.exit(2);
}
const mnemonic = 'abstract affair idle position alien fluid board ordinary exist afraid chapter wood wood guide sun walnut crew perfect place firm poverty model side million';

// The SDK is a browser build: it opens its socket through window.WebSocket
// and its ed25519 signs through self.crypto.
global.window = { crypto: globalThis.crypto, WebSocket: globalThis.WebSocket };
global.self = globalThis;
const memory = new Map();
global.localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) };
const { Zenon, Primitives, KeyStore } = require('znn-ts-sdk');
const { BigNumber } = require('ethers');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const zenon = Zenon.getSingleton();
  await zenon.initialize(url, false, 8000);
  // The node's own chain, not the SDK's local setting.
  const chainId = Number((await zenon.ledger.getFrontierMomentum()).chainIdentifier);
  if (chainId !== 321) throw new Error(`chain ${chainId} is not the lab (321); refusing to send`);
  Zenon.setChainIdentifier(chainId);

  const keys = new KeyStore().fromMnemonic(mnemonic);
  const to = await keys.getKeyPair(index).getAddress();
  const znn = Primitives.TokenStandard.parse('zts1znnxxxxxxxxxxxxx9z4ulx');
  const sent = await zenon.send(Primitives.AccountBlockTemplate.send(to, znn, BigNumber.from(amount).mul(100000000)), keys.getKeyPair(1));
  for (let waited = 0; waited < 180; waited += 3) {
    const block = await zenon.ledger.getBlockByHash(sent.hash).catch(() => null);
    if (block?.confirmationDetail) {
      const plasma = await zenon.embedded.plasma.get(to);
      console.log(`funded index ${index} ${to.toString()} with ${amount} ZNN; its plasma ${plasma.currentPlasma}`);
      process.exit(0);
    }
    await sleep(3000);
  }
  throw new Error('the send was not confirmed in three minutes');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
