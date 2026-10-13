'use strict';

// Writes updates.json, the file an installed Firefox add-on reads to find its
// next version: the manifest's update_url is this file on the latest release.
// Run by the release workflow once the add-on is signed, with XPI (the signed
// file), VERSION and REPOSITORY (owner/name) in the environment.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const { XPI, VERSION, REPOSITORY } = process.env;
if (!XPI || !VERSION || !REPOSITORY) throw new Error('XPI, VERSION and REPOSITORY are required');
const gecko = JSON.parse(fs.readFileSync('build-firefox/manifest.json', 'utf8')).browser_specific_settings.gecko;
const hash = crypto.createHash('sha256').update(fs.readFileSync(XPI)).digest('hex');
fs.writeFileSync('updates.json', JSON.stringify({ addons: { [gecko.id]: { updates: [{
  version: VERSION,
  update_link: `https://github.com/${REPOSITORY}/releases/download/v${VERSION}/${path.basename(XPI)}`,
  update_hash: `sha256:${hash}`,
  applications: { gecko: { strict_min_version: gecko.strict_min_version } },
}] } } }, null, 2) + '\n');
