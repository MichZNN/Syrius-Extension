#!/usr/bin/env node
// Which accounts published a receive block in the last N days, read straight
// off a node. For checking what the Zap page draws its alien from
// (src/services/zap/zap.js) against the chain itself.
//
//   node tools/pillar/recipients.js [days] [--node wss://…]
//
// Reads only. The node defaults to the devnet.
const WebSocket = require('ws');

const args = process.argv.slice(2);
const at = args.indexOf('--node');
const node = at >= 0 ? args.splice(at, 2)[1] : 'wss://devnet.zenon.foo/zenon';
const days = Number(args[0] || 7);

const socket = new WebSocket(node);
let id = 0;
const waiting = new Map();
const request = (method, params) => new Promise((resolve, reject) => {
  id += 1;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
});
socket.on('message', (data) => {
  const reply = JSON.parse(data.toString());
  const entry = waiting.get(reply.id);
  waiting.delete(reply.id);
  if (reply.error) entry.reject(new Error(reply.error.message));
  else entry.resolve(reply.result);
});

socket.on('open', async () => {
  try {
    const frontier = await request('ledger.getFrontierMomentum', []);
    const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    let low = 1;
    let high = frontier.height;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const momentum = (await request('ledger.getMomentumsByHeight', [middle, 1])).list[0];
      if (momentum.timestamp >= since) high = middle; else low = middle + 1;
    }
    const counts = new Map();
    for (let height = low; height <= frontier.height; height += 500) {
      const detailed = await request('ledger.getDetailedMomentumsByHeight', [height, Math.min(500, frontier.height - height + 1)]);
      for (const entry of detailed.list) for (const block of entry.blocks) {
        if (block.blockType === 3) counts.set(block.address, (counts.get(block.address) || 0) + 1);
      }
    }
    console.log(`frontier ${frontier.height} (${new Date(frontier.timestamp * 1000).toISOString()}), window from ${frontier.timestamp < since ? 'nowhere: the frontier is older' : low}`);
    console.log(`${counts.size} accounts received in the last ${days} days`);
    for (const [address, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${address}  ${count}`);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
socket.on('error', (error) => { console.error(error.message); process.exit(1); });
