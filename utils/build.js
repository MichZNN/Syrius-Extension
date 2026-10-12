// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  config = require('../webpack.config');

delete config.chromeExtensionBoilerplate;

config.mode = 'production';

console.log('Starting webpack build...');

webpack(config, function (err, stats) {
  if (err) {
    console.error('Webpack error:', err);
    throw err;
  }
  
  if (stats.hasErrors()) {
    console.error('Build errors:');
    console.error(stats.toString({ colors: true }));
    process.exitCode = 1;
    return;
  }
  
  if (process.env.SYRIUS_PLATFORM === 'firefox') {
    // AMO's JavaScript parser refuses files at 5 MiB. SplitChunks.maxSize
    // cannot split a single prebundled dependency, so inspect final assets.
    const oversized = stats.compilation.getAssets().filter(asset =>
      /\.js$/i.test(asset.name) && asset.source.size() >= 5 * 1024 * 1024);
    if (oversized.length) {
      console.error('Firefox JavaScript reaches or exceeds the 5 MiB parse limit:',
        oversized.map(asset => `${asset.name} (${asset.source.size()} bytes)`).join(', '));
      process.exitCode = 1;
      return;
    }
  }

  if (stats.hasWarnings()) {
    console.warn('Build warnings:');
    console.warn(stats.toString({ colors: true }));
  }
  
  console.log('Build completed successfully!');
  console.log(stats.toString({ colors: true, chunks: false }));
});