#!/usr/bin/env node
// The unpacked-install updater (src/services/update/chromeUpdate.js) in the
// real extension, in real Chrome: Chrome's own inflating, hashing and file
// writing. Only the folder picker is left out, because no automation can
// answer it; the browser's origin-private file system stands in for the
// picked folder, with the same handle API.
//
//   node utils/dev-harness.js start --instance lab     (a harness build, running)
//   node tools/self-update/live-test.js [--instance lab]
//
// It zips the harness's own build/ as a release one patch version up, with
// its .sha256, serves both from 127.0.0.1, opens popup.html#/update and runs
// the updater against a folder seeded with this extension's manifest. Then a
// second run with a tampered checksum, which must write nothing.
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const instance = process.argv.includes('--instance') ? process.argv[process.argv.indexOf('--instance') + 1] : 'lab';
// Asynchronous: the release is served from this same process, and a
// synchronous child would hold the event loop while the page downloads it.
const harness = (...args) => new Promise((resolve, reject) => {
  execFile(process.execPath, [path.join(root, 'utils/dev-harness.js'), ...args, '--instance', instance],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
});

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// The archive `zip -qr` makes in CI: relative names with forward slashes.
const zipFolder = (folder, transform) => {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(folder, full).split(path.sep).join('/'));
  });
  walk(folder);
  const locals = []; const centrals = []; let offset = 0;
  for (const name of files) {
    const data = transform(name, fs.readFileSync(path.join(folder, name)));
    const packed = zlib.deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30); const central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return { zip: Buffer.concat([...locals, directory, end]), count: files.length };
};

(async () => {
  const build = path.join(root, 'build');
  const current = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json'), 'utf8')).version;
  const [major, minor, patch] = current.split('.').map(Number);
  const next = `${major}.${minor}.${patch + 1}`;
  const { zip, count } = zipFolder(build, (name, data) => (name === 'manifest.json'
    ? Buffer.from(JSON.stringify({ ...JSON.parse(data), version: next }, null, 2)) : data));
  const archive = `syrius-extension-${next}-chrome-brave.zip`;
  let sum = `${crypto.createHash('sha256').update(zip).digest('hex')}  ${archive}\n`;

  const server = http.createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    if (request.url === `/${archive}`) return response.end(zip);
    if (request.url === `/${archive}.sha256`) return response.end(sum);
    response.statusCode = 404; return response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const run = (folderName) => harness('eval', `(async () => {
    const opfs = await navigator.storage.getDirectory();
    await opfs.removeEntry(${JSON.stringify(folderName)}, { recursive: true }).catch(() => {});
    const folder = await opfs.getDirectoryHandle(${JSON.stringify(folderName)}, { create: true });
    const seed = await (await folder.getFileHandle('manifest.json', { create: true })).createWritable();
    await seed.write(JSON.stringify(chrome.runtime.getManifest())); await seed.close();
    let outcome = 'updated';
    try {
      await window.__syriusUpdate.updateFolder(${JSON.stringify(next)}, { folder, base: ${JSON.stringify(base)}, requestDownload: false, reload: () => {} });
    } catch (error) { outcome = 'refused: ' + error.message; }
    const manifest = JSON.parse(await (await (await folder.getFileHandle('manifest.json')).getFile()).text());
    let files = 0;
    const walk = async (dir) => { for await (const entry of dir.values()) { if (entry.kind === 'directory') await walk(entry); else files += 1; } };
    await walk(folder);
    return JSON.stringify({ outcome, version: manifest.version, files });
  })()`);

  try {
    await harness('route', '/update');
    if (!(await harness('eval', 'String(Boolean(window.__syriusUpdate))')).includes('true')) throw new Error('not a harness build, or the update page is not open');
    const good = JSON.parse((await run('updated-copy')).trim().split('\n').pop());
    console.log(`release ${next}, ${count} files: ${JSON.stringify(good)}`);
    sum = `${'0'.repeat(64)}  ${archive}\n`;
    const bad = JSON.parse((await run('tampered-copy')).trim().split('\n').pop());
    console.log(`tampered checksum: ${JSON.stringify(bad)}`);
    // Remembering: the picked folder is stored and handed back as the same
    // entry, a wrong pick is refused, and the reset forgets it.
    const remembered = JSON.parse((await harness('eval', `(async () => {
      const opfs = await navigator.storage.getDirectory();
      const folder = await opfs.getDirectoryHandle('updated-copy');
      const other = await opfs.getDirectoryHandle('not-the-extension', { create: true });
      const u = window.__syriusUpdate;
      let wrong = 'accepted';
      try { await u.chooseFolder({ picker: async () => other }); } catch (error) { wrong = error.code; }
      await u.chooseFolder({ picker: async () => folder });
      const kept = await u.savedFolder();
      const same = Boolean(kept) && await kept.isSameEntry(folder);
      await u.resetUpdatePrefs();
      return JSON.stringify({ wrong, same, afterReset: await u.savedFolder() });
    })()`)).trim().split('\n').pop());
    console.log(`remember and reset: ${JSON.stringify(remembered)}`);
    const ok = remembered.wrong === 'UPDATE_WRONG_FOLDER' && remembered.same === true && remembered.afterReset === null &&
      good.outcome === 'updated' && good.version === next && good.files === count &&
      bad.outcome.startsWith('refused') && bad.version === current && bad.files === 1;
    console.log(ok ? 'PASS' : 'FAIL');
    process.exitCode = ok ? 0 : 1;
  } finally {
    server.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
