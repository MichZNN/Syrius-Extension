const webpack = require('webpack');
const path = require('path');
const fileSystem = require('fs-extra');
const env = require('./utils/env');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
// const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const ASSET_PATH = process.env.ASSET_PATH || '/';

// Setup aliases
const alias = {
  'react-dom': '@hot-loader/react-dom',
};

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
  
  entry: {
    newtab: path.join(__dirname, './src/sections/Newtab/index.jsx'),
    options: path.join(__dirname, './src/sections/Options/index.jsx'),
    popup: path.join(__dirname, './src/sections/Popup/index.jsx'),
    background: path.join(__dirname, './src/sections/Background/index.js'),
    contentScript: path.join(__dirname, './src/sections/Content/index.js'),
    devtools: path.join(__dirname, './src/sections/Devtools/index.js'),
    panel: path.join(__dirname, './src/sections/Panel/index.jsx'),
  },
  
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'build'),
    clean: true,
    publicPath: ASSET_PATH,
  },
  
  devtool: 'cheap-module-source-map',
  
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
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
              sourceMap: true,
              sassOptions: {
                quietDeps: true,  // Suppress deprecation warnings from dependencies
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
        test: /\.(ts|tsx)$/,
        loader: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          'source-map-loader',
          'babel-loader',
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.wasm$/,
        loader: 'base64-loader',
        type: 'javascript/auto',
      },
      {
        test: /\.obj$/,
        loader: 'webpack-obj-loader',
        include: path.join(__dirname, './src/assets/3d-models')
      },
    ],
  },
  
  resolve: {
    alias: alias,
    extensions: fileExtensions
      .map(extension => '.' + extension)
      .concat(['.js', '.jsx', '.ts', '.tsx', '.css']),
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
    new CleanWebpackPlugin({ verbose: false }),
    
    new webpack.ProgressPlugin(),
    
    new webpack.EnvironmentPlugin(['NODE_ENV']),
    
    // Bundle analyzer for size optimization
    // new BundleAnalyzerPlugin({
    //   analyzerMode: 'static',
    //   openAnalyzer: false,
    //   reportFilename: 'bundle-report.html'
    // }),
    
    // Copy manifest with version injection
    new CopyWebpackPlugin({
      patterns: [
        {
          from: './src/manifest.json',
          to: path.resolve(__dirname, 'build'),
          force: true,
          transform: (content) => {
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              }, null, 2)
            );
          },
        },
      ],
    }),
    
    // Copy static assets
    new CopyWebpackPlugin({
      patterns: [
        {
          from: './src/sections/Content/content.styles.css',
          to: path.resolve(__dirname, 'build'),
          force: true,
        },
        {
          from: './src/assets/img/icon-128.png',
          to: path.resolve(__dirname, 'build'),
          force: true,
        },
        {
          from: './src/assets/img/icon-34.png',
          to: path.resolve(__dirname, 'build'),
          force: true,
        },
      ],
    }),
    
    // HTML pages
    new HtmlWebpackPlugin({
      template: './src/sections/Newtab/index.html',
      filename: 'newtab.html',
      chunks: ['newtab'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/sections/Options/index.html',
      filename: 'options.html',
      chunks: ['options'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/sections/Popup/index.html',
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/sections/Devtools/index.html',
      filename: 'devtools.html',
      chunks: ['devtools'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: './src/sections/Panel/index.html',
      filename: 'panel.html',
      chunks: ['panel'],
      cache: false,
    }),
    
    // Polyfills
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