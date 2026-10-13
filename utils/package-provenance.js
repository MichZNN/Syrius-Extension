'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const patterns = {
  chrome: /^syrius-extension-\d+\.\d+\.\d+(?:\.\d+)?-chrome-brave\.zip$/,
  ios: /^syrius-\d+\.\d+\.\d+(?:\.\d+)?-ios-unsigned\.ipa$/,
  android: /^syrius-\d+\.\d+\.\d+(?:\.\d+)?-android\.apk$/,
  firefox: /^syrius-extension-\d+\.\d+\.\d+(?:\.\d+)?-firefox\.xpi$/,
};
const invalid = () => { throw new Error('Invalid package provenance input.'); };

const describe = async (artifactPath, platform, context) => {
  if (typeof artifactPath !== 'string' || !Object.hasOwn(patterns, platform) || !patterns[platform].test(path.basename(artifactPath))) invalid();
  if (!context || ['sourceCommit', 'sourceTree', 'repository', 'runId', 'runAttempt'].some(key => typeof context[key] !== 'string')) invalid();
  if (!/^[0-9a-f]{40}$/.test(context.sourceCommit || '') || !/^[0-9a-f]{40}$/.test(context.sourceTree || '') ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository || '') ||
      !/^[1-9][0-9]*$/.test(context.runId || '') || !/^[1-9][0-9]*$/.test(context.runAttempt || '')) invalid();
  const original = await fs.promises.lstat(artifactPath, { bigint: true });
  if (!original.isFile() || original.size <= 0n || original.size > 1024n * 1024n * 1024n) invalid();
  const file = await fs.promises.open(artifactPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = await file.stat({ bigint: true });
    if (before.dev !== original.dev || before.ino !== original.ino) invalid();
    const hash = crypto.createHash('sha256');
    let bytes = 0n;
    for await (const block of file.createReadStream({ autoClose: false })) {
      bytes += BigInt(block.length);
      if (bytes > before.size) invalid();
      hash.update(block);
    }
    const after = await file.stat({ bigint: true });
    const named = await fs.promises.lstat(artifactPath, { bigint: true });
    if (!named.isFile() || named.dev !== before.dev || named.ino !== before.ino || bytes !== before.size ||
        after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) invalid();
    return {
      schema: 'syrius-package-provenance/v1',
      artifact: path.basename(artifactPath), platform,
      sha256: hash.digest('hex'), bytes: Number(bytes),
      source_repository: context.repository, source_commit: context.sourceCommit, source_tree: context.sourceTree,
      run_id: context.runId, run_attempt: context.runAttempt,
      workflow_url: `https://github.com/${context.repository}/actions/runs/${context.runId}`,
    };
  } finally { await file.close(); }
};

if (require.main === module) {
  const [artifactPath, platform, sourceCommit, sourceTree] = process.argv.slice(2);
  describe(artifactPath, platform, { sourceCommit, sourceTree, repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT })
    .then(record => fs.promises.writeFile(`${artifactPath}.provenance.json`, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }))
    .catch(() => { console.error('Package provenance could not be recorded.'); process.exitCode = 1; });
}
module.exports = { describe };
