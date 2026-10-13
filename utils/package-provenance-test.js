'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { describe } = require('./package-provenance');

const context = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), repository: 'example/wallet', runId: '123', runAttempt: '2' };
const fixture = async body => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'syrius-provenance-'));
  try { await body(directory); } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
};
test('records the exact payload, checkout and attempt for all four package kinds', async () => fixture(async directory => {
  const kinds = { chrome: 'syrius-extension-0.3.6-chrome-brave.zip', ios: 'syrius-0.3.6-ios-unsigned.ipa',
    android: 'syrius-0.3.6-android.apk', firefox: 'syrius-extension-0.3.6-firefox.xpi' };
  const bytes = Buffer.from([0, 255, 42, 65]);
  for (const [platform, name] of Object.entries(kinds)) {
    const file = path.join(directory, name); await fs.promises.writeFile(file, bytes);
    const record = await describe(file, platform, context);
    assert.equal(record.artifact, name); assert.equal(record.platform, platform);
    assert.equal(record.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(record.bytes, bytes.length); assert.equal(record.source_commit, context.sourceCommit);
    assert.equal(record.source_tree, context.sourceTree); assert.equal(record.run_attempt, '2');
    assert.equal(record.workflow_url, 'https://github.com/example/wallet/actions/runs/123');
    assert(!JSON.stringify(record).includes(directory)); assert.deepEqual(await fs.promises.readFile(file), bytes);
  }
}));
test('fails closed when source/run identity is missing or malformed', async () => fixture(async directory => {
  const file = path.join(directory, 'syrius-extension-0.3.6-chrome-brave.zip'); await fs.promises.writeFile(file, 'payload');
  for (const [key, bad] of Object.entries({ sourceCommit: 'HEAD', sourceTree: '', repository: '/private/path', runId: '0', runAttempt: 'unknown' })) {
    await assert.rejects(describe(file, 'chrome', { ...context, [key]: bad }), /Invalid package provenance input/);
  }
}));
test('refuses a different platform, arbitrary file, empty payload and directory', async () => fixture(async directory => {
  const file = path.join(directory, 'syrius-0.3.6-android.apk'); await fs.promises.writeFile(file, 'payload');
  await assert.rejects(describe(file, 'chrome', context));
  await assert.rejects(describe(path.join(directory, '.env'), 'android', context));
  await fs.promises.writeFile(file, ''); await assert.rejects(describe(file, 'android', context));
  await fs.promises.rm(file); await fs.promises.mkdir(file); await assert.rejects(describe(file, 'android', context));
}));
test('the CLI writes one record and refuses to overwrite existing evidence', async () => fixture(async directory => {
  const file = path.join(directory, 'syrius-0.3.6-android.apk'); await fs.promises.writeFile(file, 'payload');
  const argv = [require.resolve('./package-provenance'), file, 'android', context.sourceCommit, context.sourceTree];
  const env = { ...process.env, GITHUB_REPOSITORY: context.repository, GITHUB_RUN_ID: context.runId, GITHUB_RUN_ATTEMPT: context.runAttempt };
  assert.equal(spawnSync(process.execPath, argv, { env }).status, 0);
  const before = await fs.promises.readFile(file + '.provenance.json');
  assert.equal(JSON.parse(before).artifact, path.basename(file));
  assert.notEqual(spawnSync(process.execPath, argv, { env }).status, 0);
  assert.deepEqual(await fs.promises.readFile(file + '.provenance.json'), before);
}));
