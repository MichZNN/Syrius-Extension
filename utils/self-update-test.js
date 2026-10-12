'use strict';
// Updating an unpacked install (src/services/update): the archive reader,
// the release checks, the write order and the whole update, against
// in-memory folder handles. Node's own DecompressionStream and Web Crypto do
// the inflating and hashing, as the browser's do.
//
//   node utils/self-update-test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const cache = new Map();
const load = (file) => {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const { code } = babel.transformFileSync(filename, { presets: [['@babel/preset-env', { targets: { node: 'current' } }]], babelrc: false, configFile: false });
  const resolve = (id) => (id.startsWith('.') ? load(path.resolve(path.dirname(filename), id) + (path.extname(id) ? '' : '.js')) : require(id));
  new Function('module', 'exports', 'require', code)(mod, mod.exports, resolve);
  return mod.exports;
};

const manifest = { name: 'Syrius — Zenon Wallet', manifest_version: 3, version: '0.3.6' };
const permissions = { requested: [], removed: [], grant: true };
global.chrome = {
  runtime: { getManifest: () => manifest, reload: () => {} },
  permissions: {
    request: async (what) => { permissions.requested.push(what); return permissions.grant; },
    remove: async (what) => { permissions.removed.push(what); return true; },
  },
};

const { readZip, crc32 } = load('src/services/update/zip.js');
const update = load('src/services/update/chromeUpdate.js');

// A ZIP as CI's `zip -qr` makes one: local headers, a central directory.
const makeZip = (entries, { deflate = true, corrupt = null } = {}) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data: text } of entries) {
    const data = Buffer.from(text);
    const packed = deflate ? zlib.deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name);
    const crc = corrupt === name ? (crc32(data) ^ 1) >>> 0 : crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
};

// A folder as the File System Access API hands one over, in memory.
const folderOf = (files = {}, { permission = 'granted', grants = true } = {}) => {
  const order = [];
  const make = (prefix) => ({
    name: prefix.split('/').filter(Boolean).pop() || 'syrius-extension',
    queryPermission: async () => permission,
    requestPermission: async () => (grants ? 'granted' : 'denied'),
    getDirectoryHandle: async (name) => make(`${prefix}${name}/`),
    getFileHandle: async (name, { create } = {}) => {
      const key = `${prefix}${name}`;
      if (!(key in files) && !create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      return {
        getFile: async () => ({ text: async () => Buffer.from(files[key]).toString() }),
        createWritable: async () => {
          const chunks = [];
          return { write: async (data) => chunks.push(Buffer.from(data)), close: async () => { files[key] = Buffer.concat(chunks); order.push(key); } };
        },
      };
    },
  });
  return { handle: make(''), files, order };
};

const sha = (bytes) => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
const serve = (zip, sum = `${sha(zip)}  syrius-extension-0.3.7-chrome-brave.zip\n`) => {
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    if (url.endsWith('.zip')) return { ok: true, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) };
    if (url.endsWith('.sha256')) return { ok: true, text: async () => sum };
    return { ok: false };
  };
  return { fetcher, asked };
};
const release = (version = '0.3.7', name = manifest.name) => [
  { name: 'popup.html', data: '<html>new</html>' },
  { name: 'assets/app.js', data: 'console.log("new")'.repeat(50) },
  { name: 'manifest.json', data: JSON.stringify({ ...manifest, name, version }) },
];

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed += 1; } catch (error) { console.error(`FAIL ${name}`); throw error; }
};

(async () => {
  await test('zip: stored and deflated entries read back exactly', async () => {
    for (const deflate of [true, false]) {
      const files = await readZip(makeZip(release(), { deflate }));
      assert.deepEqual(files.map((file) => file.name), ['popup.html', 'assets/app.js', 'manifest.json']);
      assert.equal(Buffer.from(files[1].data).toString(), 'console.log("new")'.repeat(50));
    }
  });

  await test('zip: a bad checksum, an escaping name or a repeat refuses the whole archive', async () => {
    await assert.rejects(readZip(makeZip(release(), { corrupt: 'popup.html' })), (error) => error.code === 'UPDATE_ARCHIVE');
    for (const name of ['../evil.js', '/etc/x', 'C:/x.js', 'a/../../b', 'a\\b.js', './x']) {
      await assert.rejects(readZip(makeZip([{ name, data: 'x' }])), (error) => error.code === 'UPDATE_ARCHIVE', name);
    }
    await assert.rejects(readZip(makeZip([{ name: 'a.js', data: '1' }, { name: 'a.js', data: '2' }])), /twice/);
    await assert.rejects(readZip(new Uint8Array(40)), /no central directory/);
  });

  await test('release: only this extension, at exactly the newer version asked for', async () => {
    assert.equal((await update.checkRelease(makeZip(release()), '0.3.7')).length, 3);
    await assert.rejects(update.checkRelease(makeZip(release('0.3.8')), '0.3.7'), (error) => error.code === 'UPDATE_VERSION');
    await assert.rejects(update.checkRelease(makeZip(release('0.3.6')), '0.3.6'), (error) => error.code === 'UPDATE_VERSION', 'not newer');
    await assert.rejects(update.checkRelease(makeZip(release('0.3.7', 'Some Other Wallet')), '0.3.7'), (error) => error.code === 'UPDATE_NOT_THIS');
    await assert.rejects(update.checkRelease(makeZip(release().filter((file) => file.name !== 'manifest.json')), '0.3.7'), (error) => error.code === 'UPDATE_NOT_THIS');
  });

  await test('download: from the constant release URL, and refused when its checksum differs', async () => {
    const zip = makeZip(release());
    const { fetcher, asked } = serve(zip);
    assert.deepEqual(await update.downloadRelease('0.3.7', { fetcher }), zip);
    assert.deepEqual(asked, [
      'https://github.com/sol-znn/syrius-extension/releases/download/v0.3.7/syrius-extension-0.3.7-chrome-brave.zip',
      'https://github.com/sol-znn/syrius-extension/releases/download/v0.3.7/syrius-extension-0.3.7-chrome-brave.zip.sha256',
    ]);
    await assert.rejects(update.downloadRelease('0.3.7', serve(zip, `${'0'.repeat(64)}  x`)), (error) => error.code === 'UPDATE_CHECKSUM');
    await assert.rejects(update.downloadRelease('0.3.7', serve(zip, 'not a hash')), (error) => error.code === 'UPDATE_CHECKSUM');
  });

  await test('folder: this extension only', async () => {
    assert.equal(await update.isThisExtension(folderOf({ 'manifest.json': JSON.stringify(manifest) }).handle), true);
    assert.equal(await update.isThisExtension(folderOf({ 'manifest.json': JSON.stringify({ ...manifest, name: 'Other' }) }).handle), false);
    assert.equal(await update.isThisExtension(folderOf({}).handle), false);
    const picked = folderOf({ 'manifest.json': '{"name":"Other"}' }).handle;
    await assert.rejects(update.chooseFolder({ picker: async () => picked }), (error) => error.code === 'UPDATE_WRONG_FOLDER');
  });

  await test('update: downloads, checks, writes manifest.json last, then reloads', async () => {
    const zip = makeZip(release());
    const folder = folderOf({ 'manifest.json': JSON.stringify(manifest), 'popup.html': '<html>old</html>' });
    const stages = [];
    let reloaded = 0;
    await update.updateFolder('v0.3.7', { folder: folder.handle, fetcher: serve(zip).fetcher, onStage: (name) => stages.push(name), reload: () => { reloaded += 1; } });
    assert.deepEqual(folder.order, ['popup.html', 'assets/app.js', 'manifest.json']);
    assert.equal(JSON.parse(folder.files['manifest.json']).version, '0.3.7');
    assert.equal(folder.files['popup.html'].toString(), '<html>new</html>');
    assert.deepEqual([...new Set(stages)], ['downloading', 'checking', 'writing', 'reloading']);
    assert.equal(reloaded, 1);
    assert.deepEqual(permissions.requested.at(-1), { origins: update.downloadOrigins });
  });

  await test('update: nothing is written when any check fails', async () => {
    for (const [zip, sum] of [
      [makeZip(release('0.3.8')), undefined],
      [makeZip(release(), { corrupt: 'assets/app.js' }), undefined],
      [makeZip(release()), `${'1'.repeat(64)}  x`],
    ]) {
      const folder = folderOf({ 'manifest.json': JSON.stringify(manifest) });
      let reloaded = 0;
      await assert.rejects(update.updateFolder('0.3.7', { folder: folder.handle, fetcher: serve(zip, sum).fetcher, reload: () => { reloaded += 1; } }));
      assert.deepEqual(folder.order, []);
      assert.equal(reloaded, 0);
    }
    // Refused permissions, a folder that is no longer this extension.
    permissions.grant = false;
    await assert.rejects(update.updateFolder('0.3.7', { folder: folderOf({ 'manifest.json': JSON.stringify(manifest) }).handle }), (error) => error.errorId === 127);
    permissions.grant = true;
    await assert.rejects(update.updateFolder('0.3.7', { folder: folderOf({ 'manifest.json': JSON.stringify(manifest) }, { permission: 'prompt', grants: false }).handle }), (error) => error.errorId === 128);
    await assert.rejects(update.updateFolder('0.3.7', { folder: folderOf({}).handle }), (error) => error.errorId === 121);
    await assert.rejects(update.updateFolder('latest', { folder: folderOf({}).handle }), (error) => error.errorId === 126);
  });

  await test('reset: forgets the folder and gives back the download permission', async () => {
    global.indexedDB = undefined; // No store in Node: the forget is best effort, the permission is not.
    await update.resetUpdatePrefs();
    assert.deepEqual(permissions.removed.at(-1), { origins: update.downloadOrigins });
  });

  console.log(`self-update: archive reading, release checks, checksum, folder identity, write order and refusals: ${passed} passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
