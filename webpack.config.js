const webpack = require('webpack');
const path = require('path');
const fileSystem = require('fs-extra');
const env = require('./utils/env');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const ASSET_PATH = process.env.ASSET_PATH || '/';
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const platform = process.env.SYRIUS_PLATFORM || 'chrome';
if (!['chrome', 'firefox', 'android', 'ios'].includes(platform)) {
  throw new Error(`SYRIUS_PLATFORM must be chrome, firefox, android or ios, not ${platform}`);
}

const alias = {
  // Pinned to this project's copies: these are polyfills for node built-ins,
  // and every bundle must get the same one whatever asked for it.
  'process/browser': require.resolve('process/browser.js'),
  'crypto-browserify': require.resolve('crypto-browserify'),
};

// Chrome's package keeps `build/`, which CI, the dev harness and the browser
// tests all load. Every other platform builds beside it, so making a Firefox
// package never replaces the Chrome one. The two apps share `build-app/`,
// because Capacitor reads one webDir for both; each is built just before its
// `cap sync`.
const isApp = platform === 'android' || platform === 'ios';
const outputDir = path.resolve(__dirname, platform === 'chrome' ? 'build' : isApp ? 'build-app' : `build-${platform}`);

// src/manifest.json is Chrome's. Firefox reads the same Manifest V3 with three
// differences: no background service worker (an event page runs the same
// bundle), a fixed add-on ID with its minimum version and update manifest, and
// the data collection declaration AMO requires, which is none. The GitHub host
// permissions are dropped: they exist only for the unpacked Chrome updater.
const firefoxId = 'syrius-extension@zenon-network';
const manifestFor = (manifest) => {
  if (platform !== 'firefox') return manifest;
  const {
    minimum_chrome_version: _chromeOnly,
    optional_host_permissions: _unpackedUpdater,
    // Chrome's open-tab injection only (sections/Background/openTabs.js).
    // Firefox makes MV3 host permissions opt-in; its content scripts need none.
    host_permissions: _openTabs,
    ...rest
  } = manifest;
  return {
    ...rest,
    // Firefox has no offscreen documents; its receiver is an iframe in the
    // background page (sections/Background/receiver.js). It injects content
    // scripts into open tabs itself, so it needs no scripting either
    // (sections/Background/openTabs.js).
    permissions: manifest.permissions.filter((permission) => permission !== 'offscreen' && permission !== 'scripting'),
    background: { scripts: [manifest.background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: firefoxId,
        // 140 is the first to read data_collection_permissions (and the ESR).
        strict_min_version: '140.0',
        update_url: 'https://github.com/sol-znn/syrius-extension/releases/latest/download/updates.json',
        data_collection_permissions: { required: ['none'] },
      },
    },
  };
};

// The app (android, ios) is one page: the chrome.* shim, then the background
// script, then the popup (src/platform/mobileShim.js).
const appManifest = () => ({
  ...JSON.parse(fileSystem.readFileSync(path.join(__dirname, 'src/manifest.json'), 'utf8')),
  version: process.env.npm_package_version || require('./package.json').version,
});

// Load secrets if they exist
const secretsPath = path.join(__dirname, 'secrets.' + env.NODE_ENV + '.js');
if (fileSystem.existsSync(secretsPath)) {
  alias['secrets'] = secretsPath;
}

// File extensions for assets
const fileExtensions = [
  'jpg', 'jpeg', 'png', 'gif', 'eot', 'otf', 'svg', 'ttf', 'woff', 'woff2'
];

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  target: 'web',

  // Only what the manifest actually loads. The boilerplate's newtab, options,
  // panel and devtools pages were never declared there and never reachable —
  // they only cost build time and a second copy of the vendor chunk.
  entry: {
    popup: path.join(__dirname, './src/sections/Popup/index.jsx'),
    background: path.join(__dirname, './src/sections/Background/index.js'),
    contentScript: path.join(__dirname, './src/sections/Content/index.js'),
    inpage: path.join(__dirname, './src/sections/Inpage/index.js'),
    ...(isApp && { mobileShim: path.join(__dirname, './src/platform/mobileShim.js') }),
    // Receives in the background while a timed unlock lasts (sections/Receiver).
    // The app does that in its own page.
    ...(!isApp && { receiver: path.join(__dirname, './src/sections/Receiver/index.js') }),
  },

  output: {
    filename: '[name].bundle.js',
    path: outputDir,
    clean: true,
    // Relative in the app, so the same files load from Capacitor's origin or
    // straight from disk.
    publicPath: isApp ? './' : ASSET_PATH,
  },

  // A published extension ships whatever is in `build`, and a source map of a
  // 7 MiB bundle is bigger than the bundle. Development keeps them.
  devtool: isProduction ? false : 'cheap-module-source-map',

  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          // This wallet logs addresses, balances and whole account blocks at
          // every step. None of that belongs in a user's console.
          compress: { drop_console: ['log', 'debug', 'info'] },
        },
      }),
    ],
    splitChunks: {
      // The content script and the injected page script run on every site the
      // user visits, so they must stay standalone — a shared vendor chunk they
      // cannot load would break them. Only the popup and the receiver page,
      // which share it, get one.
      chunks: (chunk) => chunk.name === 'popup' || chunk.name === 'receiver',
      cacheGroups: {
        vendor: {
          // A path test rather than a regex: this repo builds on Windows,
          // where module paths are separated by backslashes.
          test: (module) => (module.resource || '').includes('node_modules'),
          name: 'vendors',
          chunks: (chunk) => chunk.name === 'popup' || chunk.name === 'receiver',
          // AMO's validator refuses to parse a script over 5 MB, and the
          // vendor chunk is 6. Firefox gets it in pieces; Chrome keeps one file.
          ...(platform === 'firefox' && { name: false, maxSize: 4 * 1024 * 1024 }),
        }
      }
    },
  },

  module: {
    noParse: /\.wasm$/,
    rules: [
      {
        test: /\.(css|scss)$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'sass-loader',
            options: {
              sourceMap: !isProduction,
              sassOptions: {
                quietDeps: true,
                silenceDeprecations: ['legacy-js-api', 'color-functions', 'global-builtin'],
              },
            },
          },
        ],
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        type: 'asset/resource',
        exclude: /node_modules/,
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(js|jsx)$/,
        use: ['babel-loader'],
        exclude: /node_modules/,
      },
      {
        test: /\.wasm$/,
        loader: 'base64-loader',
        type: 'javascript/auto',
      },
      // The SDK is one prebundled 5.3 MB module, over AMO's 5 MiB parse limit
      // on its own. Its two large string constants become modules of their
      // own, so the vendor split above can separate them (issue #44).
      ...(platform === 'firefox' ? [{
        test: (resource) => resource.replace(/\\/g, '/').endsWith('node_modules/znn-ts-sdk/dist/index.js'),
        loader: path.resolve(__dirname, 'utils/sdk-split-loader.js'),
      }] : []),
    ],
  },

  resolve: {
    // `znn-ts-sdk` is a `file:` dependency, so npm links it rather than copying
    // it, and the linked repo has no node_modules of its own. Following the
    // symlink to its real path makes webpack resolve that package's imports
    // from outside this project entirely, where `process/browser` and
    // `crypto-browserify` do not exist. Keeping the linked path means its
    // dependencies resolve here, like every other package's.
    symlinks: false,

    alias: alias,
    extensions: fileExtensions
      .map(extension => '.' + extension)
      .concat(['.js', '.jsx', '.css']),
    fallback: {
      "fs": false,
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer"),
      "crypto": require.resolve("crypto-browserify"),
      "path": require.resolve("path-browserify"),
      "constants": require.resolve("constants-browserify"),
      "assert": require.resolve("assert/"),
      "vm": require.resolve("vm-browserify"),
      "tls": false,
      "net": false,
      "zlib": false,
      "http": false,
      "https": false,
      "events": false
    },
  },

  plugins: [
    new webpack.ProgressPlugin(),

    new webpack.EnvironmentPlugin(['NODE_ENV']),

    // Only the dev harness (utils/dev-harness.js) turns this on, for the build
    // it drives itself. Every other build compiles it to 'false', which leaves
    // the auto-unlock in src/services/utils/devWallet.js as dead code.
    new webpack.EnvironmentPlugin({ SYRIUS_DEV_WALLET: 'false' }),

    // Which package this build is: chrome (Chrome, Brave), firefox, android or
    // ios. It picks the manifest below and how About updates the wallet
    // (src/services/utils/selfUpdate.js).
    new webpack.EnvironmentPlugin({ SYRIUS_PLATFORM: platform }),

    // What chrome.runtime.getManifest() answers in the app.
    ...(isApp ? [new webpack.DefinePlugin({ 'process.env.SYRIUS_MANIFEST': JSON.stringify(appManifest()) })] : []),

    new CopyWebpackPlugin({
      patterns: [
        { from: './LICENSE', to: 'LICENSE', toType: 'file' },
        { from: './src/assets/fonts/space-grotesk-LICENSE.txt', to: 'space-grotesk-LICENSE.txt', toType: 'file' },
        { from: './src/assets/fonts/jetbrains-mono-LICENSE.txt', to: 'jetbrains-mono-LICENSE.txt', toType: 'file' },
        { from: './src/components/icon/lucide-LICENSE.txt', to: 'lucide-LICENSE.txt', toType: 'file' },
        {
          from: path.join(path.dirname(require.resolve('znn-ts-sdk/package.json')), 'dist/index.js.LICENSE.txt'),
          to: 'index.js.LICENSE.txt',
          toType: 'file',
        },
        {
          from: path.join(path.dirname(require.resolve('argon2-browser/package.json')), 'LICENSE'),
          to: 'argon2-browser.LICENSE.txt',
          toType: 'file',
        },
        {
          from: path.join(__dirname, 'utils/third-party-readme-notices.js'),
          to: 'third-party-readme-notices.txt',
          toType: 'file',
          transform: () => require('./utils/third-party-readme-notices')(),
        },
        { from: path.join(__dirname, 'utils/approval-pow-worker.js'), to: 'approval-pow-worker.js', transform: () => require('./utils/approval-pow-worker')() },
        { from: path.join(__dirname, 'utils/zts-search-worker.js'), to: 'zts-search-worker.js', transform: () => require('./utils/zts-search-worker')() },
        {
          from: './src/manifest.json',
          to: outputDir,
          force: true,
          transform: (content) => {
            return Buffer.from(
              JSON.stringify(manifestFor({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              }), null, 2)
            );
          },
        },
        {
          from: './src/assets/img/icon-128.png',
          to: outputDir,
          force: true,
        },
        {
          from: './src/assets/img/icon-34.png',
          to: outputDir,
          force: true,
        },
      ],
    }),

    new HtmlWebpackPlugin({
      template: './src/sections/Popup/index.html',
      filename: 'popup.html',
      chunks: isApp ? ['mobileShim', 'background', 'vendors', 'popup'] : ['vendors', 'popup'],
      chunksSortMode: 'manual',
      cache: false,
    }),

    // Capacitor opens index.html; the wallet's own links name popup.html.
    ...(isApp ? [] : [new HtmlWebpackPlugin({
      template: './src/sections/Receiver/index.html',
      filename: 'receiver.html',
      chunks: ['vendors', 'receiver'],
      chunksSortMode: 'manual',
      cache: false,
    })]),
    ...(isApp ? [new HtmlWebpackPlugin({
      template: './src/sections/Popup/index.html',
      filename: 'index.html',
      chunks: ['mobileShim', 'background', 'vendors', 'popup'],
      chunksSortMode: 'manual',
      cache: false,
    })] : []),

    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],

  infrastructureLogging: {
    level: 'info',
  },

  experiments: {
    asyncWebAssembly: true,
    syncWebAssembly: true
  }
};
