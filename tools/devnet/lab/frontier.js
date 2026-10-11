#!/usr/bin/env node
// Is the lab producing? Reads the frontier momentum, then again every five
// seconds until the height has moved or the time is up.
//
//   node frontier.js [seconds to give it, default 30] [--wait <seconds>]
//
// A chain that has stopped still answers, and still takes blocks into its
// pool, so one read proves nothing. `--wait` keeps trying until the node
// answers at all, for the minute after `up`; the first momentum of a new
// chain comes about 90 s after the nodes start. Exit status 0 only when the
// height moved.
const http = require('node:http');

const args = process.argv.slice(2);
const waitAt = args.indexOf('--wait');
const wait = waitAt >= 0 ? Number(args.splice(waitAt, 2)[1]) : 0;
const patience = Number(args[0] || 30);
const url = process.env.LAB_RPC || 'http://127.0.0.1:45997';

const frontier = () => new Promise((resolve, reject) => {
  const request = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: 5000 }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      try {
        const reply = JSON.parse(body);
        if (reply.error) reject(new Error(reply.error.message));
        else resolve(reply.result);
      } catch (error) {
        reject(error);
      }
    });
  });
  request.on('timeout', () => request.destroy(new Error('no answer in 5 s')));
  request.on('error', reject);
  request.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ledger.getFrontierMomentum', params: [] }));
});

const pause = (seconds) => new Promise((resolve) => { setTimeout(resolve, seconds * 1000); });

(async () => {
  const deadline = Date.now() + wait * 1000;
  let first;
  for (;;) {
    try {
      first = await frontier();
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await pause(3);
    }
  }
  const started = Date.now();
  let second = first;
  while (second.height === first.height && Date.now() - started < patience * 1000) {
    await pause(5);
    second = await frontier();
  }
  const moved = second.height - first.height;
  console.log(`chain ${second.chainIdentifier}: ${first.height} then ${second.height} after ${Math.round((Date.now() - started) / 1000)} s`);
  console.log(moved > 0 ? 'producing' : 'NOT producing');
  process.exit(moved > 0 ? 0 : 1);
})().catch((error) => {
  console.error(`${url}: ${error.message}`);
  process.exit(1);
});
