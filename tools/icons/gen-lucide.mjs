// Generates src/components/icon/lucide.js from an installed @lucide/vue.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [src, out] = process.argv.slice(2);
const map = {
  home: 'house', tokens: 'coins', delegate: 'users', plasma: 'zap', stake: 'layers',
  send: 'arrow-up-right', receive: 'arrow-down-left', contract: 'file-text', close: 'x',
  nft: 'image', activity: 'activity', bridge: 'arrow-left-right', eye: 'eye', 'eye-off': 'eye-off',
  pillar: 'landmark', spork: 'flag', sentinel: 'shield', token: 'circle-plus', chart: 'chart-column', live: 'radio', rewards: 'hand-coins', vote: 'vote',
  key: 'key-round', password: 'lock-keyhole', network: 'network', node: 'server', link: 'link',
  sign: 'pen-line', settings: 'settings', plus: 'plus', lock: 'lock', wallet: 'wallet',
  'chevron-right': 'chevron-right', back: 'arrow-left', check: 'check', warning: 'triangle-alert',
  'circle-check': 'circle-check', 'circle-x': 'circle-x', clock: 'clock', external: 'external-link',
  copy: 'copy', sun: 'sun', moon: 'moon', monitor: 'monitor', trash: 'trash',
  'thumbs-up': 'thumbs-up', 'thumbs-down': 'thumbs-down', minus: 'minus', info: 'info',
  refresh: 'refresh-cw', circle: 'circle', 'circle-dot': 'circle-dot', loader: 'loader-circle',
  zap: 'sparkles', message: 'message-circle', dice: 'dices', party: 'party-popper',
  download: 'download', folder: 'folder',
  fingerprint: 'fingerprint-pattern', scan: 'scan-line', share: 'share-2', contacts: 'book-user', bell: 'bell',
  'plasma-none': 'battery', 'plasma-low': 'battery-low', 'plasma-average': 'battery-medium', 'plasma-high': 'battery-full',
};
const icons = {};
for (const [name, lucide] of Object.entries(map)) {
  const text = fs.readFileSync(path.join(src, lucide + '.mjs'), 'utf8');
  const data = text.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  const { node } = new Function('return ' + data)();
  icons[name] = node.map(([tag, attrs]) => { const { key, ...rest } = attrs; return [tag, rest]; });
}
const lines = Object.entries(icons).map(([name, node]) => `  ${JSON.stringify(name)}: ${JSON.stringify(node)},`);
fs.writeFileSync(out, `// Lucide icon data (https://lucide.dev, ISC licence), vendored: nothing is
// fetched at runtime. Generated from @lucide/vue 1.45.0 by tools/icons/gen-lucide.mjs;
// add a name to its map and run it again rather than editing this file.
// Each icon is drawn on a 24px grid as stroked ${'`currentColor`'} elements.
/* eslint-disable */
const lucide = {
${lines.join('\n')}
};

export default lucide;
`);
console.log(Object.keys(icons).length, 'icons');
