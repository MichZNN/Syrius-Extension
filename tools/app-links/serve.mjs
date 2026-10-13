#!/usr/bin/env node
// Serves the syrius:// link page (index.html) to a phone on the same network.
//
//   node tools/app-links/serve.mjs [--port 8787]
//
// It binds every interface and prints the LAN addresses to open on the phone.
// Plain http is enough: the app accepts an http callback only to a private
// address (linkRoutes.callbackOrigin), which is what these are.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const page = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html');
const arg = process.argv.indexOf('--port');
const port = arg > 0 ? Number(process.argv[arg + 1]) : 8787;

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (req.method !== 'GET' || (pathname !== '/' && pathname !== '/index.html')) {
    res.writeHead(404).end();
    return;
  }
  // Read per request, so an edit shows on the phone's next reload.
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(page));
}).listen(port, '0.0.0.0', () => {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net.address}:${port}/`);
  console.log(`Syrius links on port ${port}. Open on the phone:`);
  for (const url of addresses.length ? addresses : [`http://127.0.0.1:${port}/`]) console.log(`  ${url}`);
});
