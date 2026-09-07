/**
 * Start the local Webpack development server used by the unpacked extension.
 *
 * The environment is initialized before webpack.config.js is loaded because
 * that module reads NODE_ENV and ASSET_PATH while it is being evaluated.
 */
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

const WebpackDevServer = require('webpack-dev-server');
const webpack = require('webpack');
const config = require('../webpack.config');
const env = require('./env');
const path = require('path');

const boilerplateOptions = config.chromeExtensionBoilerplate || {};
const excludedEntries = new Set(boilerplateOptions.notHotReload || []);

Object.keys(config.entry).forEach((entryName) => {
  if (!excludedEntries.has(entryName)) {
    config.entry[entryName] = [
      'webpack/hot/dev-server',
      `webpack-dev-server/client?hot=true&hostname=localhost&port=${env.PORT}`,
    ].concat(config.entry[entryName]);
  }
});

// HMR modules are added to each eligible entry above, so Webpack Dev Server's
// automatic client injection stays disabled in the server options below.
config.plugins = [new webpack.HotModuleReplacementPlugin()].concat(
  config.plugins || []
);

delete config.chromeExtensionBoilerplate;

const compiler = webpack(config);

const server = new WebpackDevServer(
  {
    server: 'http',
    hot: false,
    client: false,
    host: 'localhost',
    port: env.PORT,
    static: {
      directory: path.join(__dirname, '../build'),
    },
    devMiddleware: {
      publicPath: `http://localhost:${env.PORT}/`,
      writeToDisk: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    allowedHosts: ['localhost'],
  },
  compiler
);

const startDevelopmentServer = async () => {
  try {
    await server.start();
    console.log(`Webpack Dev Server listening on http://localhost:${env.PORT}`);
  } catch {
    console.error('Could not start Webpack Dev Server. Inspect the local process for details.');
    process.exitCode = 1;
  }
};

startDevelopmentServer();
