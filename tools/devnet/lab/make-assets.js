#!/usr/bin/env node
// The lab's /devnet directory: go-zenon's committed devnet assets (genesis,
// per-role configs, pillar keystores, p2p keys) with the two things changed
// that make the lab a network of its own.
//
//   node make-assets.js <go-zenon>/docker/devnet <out dir>
//
// - ChainIdentifier. It is signed into every block and is the p2p network id,
//   so a block signed for the lab is refused by chain 69 and a wallet left
//   pointed at the public devnet cannot send there with the lab's settings.
// - The node addresses in each config.json, moved to the lab's subnet.
//
// Everything else is go-zenon's, byte for byte, so the funded addresses and
// the three genesis fuses are the ones its README describes.
const fs = require('node:fs');
const path = require('node:path');

const chainIdentifier = 321;
const subnet = { from: '172.30.0.', to: '172.37.0.' };
const roles = ['pillar', 'pillar2', 'pillar3', 'observer', 'rpc'];

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error('usage: make-assets.js <go-zenon/docker/devnet> <out dir>');
  process.exit(2);
}
if (fs.existsSync(path.join(out, 'genesis.json'))) {
  console.error(`${out} already holds a genesis. Volumes made from it need it unchanged: wipe first.`);
  process.exit(1);
}

const copy = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copy(a, b);
    else fs.copyFileSync(a, b);
  }
};

const genesis = JSON.parse(fs.readFileSync(path.join(source, 'genesis.json'), 'utf8'));
if (genesis.ChainIdentifier === chainIdentifier) throw new Error('the source genesis already uses the lab identifier');
genesis.ChainIdentifier = chainIdentifier;
genesis.ExtraData = 'SYRIUS LAB';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'genesis.json'), `${JSON.stringify(genesis, null, 4)}\n`);

for (const role of roles) {
  copy(path.join(source, role), path.join(out, role));
  const file = path.join(out, role, 'config.json');
  const text = fs.readFileSync(file, 'utf8');
  const moved = text.split(subnet.from).join(subnet.to);
  if (moved === text) throw new Error(`${role}/config.json names no ${subnet.from} address`);
  fs.writeFileSync(file, moved);
}

console.log(`lab assets in ${out}: chain ${chainIdentifier}, ${roles.length} roles on ${subnet.to}0/24`);
