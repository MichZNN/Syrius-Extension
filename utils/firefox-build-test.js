'use strict';

// Exercise the real production build, then inspect its files independently.
// An oversized Firefox package must fail explicitly, not finish successfully.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build-firefox');
const result = spawnSync(process.execPath, [path.join(__dirname, 'build.js')], {
  cwd: root,
  env: { ...process.env, SYRIUS_PLATFORM: 'firefox' },
  encoding: 'utf8',
  timeout: 180000,
  maxBuffer: 20 * 1024 * 1024,
});
assert(!result.error && !result.signal, 'Firefox build did not complete');
const scripts = fs.readdirSync(output).filter(name => /\.js$/i.test(name))
  .map(name => ({ name, bytes: fs.statSync(path.join(output, name)).size }));
assert(scripts.length > 0, 'Firefox build produced no scripts');
const oversized = scripts.filter(file => file.bytes >= 5 * 1024 * 1024);
if (oversized.length) {
  assert.equal(result.status, 1, 'An oversized Firefox build reported success');
  assert(result.stderr.includes('Firefox JavaScript reaches or exceeds the 5 MiB parse limit:'),
    'The failure did not identify oversized Firefox scripts');
  assert(!result.stdout.includes('Build completed successfully!'), 'Invalid build was labelled complete');
} else {
  assert.equal(result.status, 0, 'A Firefox build within the parse limit failed');
  assert(result.stdout.includes('Build completed successfully!'), 'Valid build did not finish');
}
// Compile controlled assets with real webpack and the actual build callback.
// The parser rejects equality too; Chrome must keep its existing build path.
const boundaryCases = [];
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-firefox-size-'));
try {
  fs.writeFileSync(path.join(fixture, 'empty.js'), '// Inert build fixture.\n');
  for (const [platform, bytes, expected] of [
    ['firefox', 5 * 1024 * 1024 - 1, 0],
    ['firefox', 5 * 1024 * 1024, 1],
    ['chrome', 5 * 1024 * 1024, 0],
  ]) {
    const destination = path.join(fixture, platform + '-' + bytes);
    const buildPath = path.join(__dirname, 'build.js');
    const code = `
      const Module = require('node:module');
      const webpack = require(${JSON.stringify(require.resolve('webpack'))});
      const config = {
        mode: 'production', entry: ${JSON.stringify(path.join(fixture, 'empty.js'))},
        output: { path: ${JSON.stringify(destination)}, filename: 'empty.js' },
        optimization: { minimize: false },
        plugins: [{ apply(compiler) {
          compiler.hooks.thisCompilation.tap('InertSizeFixture', compilation => {
            compilation.hooks.processAssets.tap({ name: 'InertSizeFixture',
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
              compilation.emitAsset('limit.js', new webpack.sources.RawSource(Buffer.alloc(${bytes}, 32)));
            });
          });
        } }],
      };
      const originalLoad = Module._load;
      Module._load = function(request, parent, isMain) {
        if (request === '../webpack.config' && parent?.filename === ${JSON.stringify(buildPath)}) {
          Module._load = originalLoad;
          return config;
        }
        return originalLoad.apply(this, arguments);
      };
      require(${JSON.stringify(buildPath)});
    `;
    const boundary = spawnSync(process.execPath, ['-e', code], {
      cwd: root, env: { ...process.env, SYRIUS_PLATFORM: platform },
      encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    });
    assert(!boundary.error && !boundary.signal, 'Boundary build did not complete');
    assert.equal(fs.statSync(path.join(destination, 'limit.js')).size, bytes);
    assert.equal(boundary.status, expected, `${platform} build at ${bytes} bytes returned the wrong status`);
    assert.equal(boundary.stdout.includes('Build completed successfully!'), expected === 0);
    if (expected === 1) {
      assert(boundary.stderr.includes(`limit.js (${bytes} bytes)`), 'Boundary failure omitted the asset');
    }
    boundaryCases.push({ platform, bytes, exit_code: boundary.status });
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
const report = {
  platform: 'firefox', production_build_exercised: true,
  build_exit_code: result.status, oversized_scripts: oversized,
  parse_limit_bytes: 5 * 1024 * 1024, scripts, boundary_cases: boundaryCases,
  scripts_within_parse_limit: oversized.length === 0,
  native_browser_or_installation_qualified: false, passed: true,
};
if (process.env.SYRIUS_FIREFOX_BUILD_REPORT) {
  fs.writeFileSync(process.env.SYRIUS_FIREFOX_BUILD_REPORT, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ firefox_build_gate_passed: true, build_exit_code: result.status,
  oversized_scripts: oversized, scripts_within_parse_limit: oversized.length === 0 }));
