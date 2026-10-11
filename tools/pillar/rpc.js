#!/usr/bin/env node
// One JSON-RPC call to a Zenon node, printed. For checking what the pillar
// screens read against what the node says.
//
//   node tools/pillar/rpc.js embedded.pillar.getByOwner '["z1…"]'
//   node tools/pillar/rpc.js embedded.accelerator.getAll '[0,5]' --node wss://node.zenonhub.io:35998
//
// Reads only: it has no key and sends no block. The node defaults to the devnet.
const WebSocket = require('ws');

const args = process.argv.slice(2);
const at = args.indexOf('--node');
const node = at >= 0 ? args.splice(at, 2)[1] : 'wss://devnet.zenon.foo/zenon';
const [method, params = '[]'] = args;

if (!method) {
  console.error('usage: rpc.js <method> [json params] [--node wss://…]');
  process.exit(2);
}

const socket = new WebSocket(node);
const timer = setTimeout(() => { console.error('No answer in 15 s'); process.exit(1); }, 15000);
socket.on('open', () => socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: JSON.parse(params) })));
socket.on('message', (data) => {
  clearTimeout(timer);
  const reply = JSON.parse(data.toString());
  console.log(JSON.stringify(reply.error || reply.result, null, 2));
  socket.close();
  process.exit(reply.error ? 1 : 0);
});
socket.on('error', (error) => { console.error(error.message); process.exit(1); });
