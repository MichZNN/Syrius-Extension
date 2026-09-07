/**
 * Build every extension entry point with the production Webpack configuration.
 *
 * These environment variables must be set before webpack.config.js is loaded;
 * that module reads NODE_ENV and ASSET_PATH while it is being evaluated.
 */
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

const webpack = require('webpack');
const config = require('../webpack.config');

delete config.chromeExtensionBoilerplate;
config.mode = 'production';

const handleBuildResult = (err, stats) => {
  if (err) {
    console.error('Webpack build failed:', err.message);
    process.exitCode = 1;
    return;
  }

  if (stats.hasErrors()) {
    const details = stats.toJson({
      all: false,
      errors: true,
      warnings: true,
      errorDetails: true,
    });
    details.errors?.forEach((error) => {
      console.error(error.message || error);
      if (error.details) {
        console.error(error.details);
      }
    });
    details.warnings?.forEach((warning) => console.warn(warning.message || warning));
    process.exitCode = 1;
    return;
  }

  if (stats.hasWarnings()) {
    const details = stats.toJson({
      all: false,
      warnings: true,
    });
    details.warnings?.forEach((warning) => console.warn(warning.message || warning));
  }

  console.log('Webpack build completed successfully.');
};

console.log('Starting production Webpack build...');
webpack(config, handleBuildResult);
