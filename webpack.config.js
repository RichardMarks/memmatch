'use strict';
const path = require('path');
const webpack = require('webpack');
const SRC = path.resolve('./src');
const ENTRY = path.resolve('./src/index.js');
const DEBUG = process.env.NODE_ENV !== 'production';
const config = {
  entry: [ENTRY],
  output: {
    filename: 'memmatch.js',
    path: path.resolve('./build'),
    library: 'memmatch',
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  plugins: DEBUG ? [] : [
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin({
      compressor: {screw_ie8: true, keep_fnames: true, warnings: false},
      mangle: {screw_ie8: true, keep_fnames: true},
    }),
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.optimize.AggressiveMergingPlugin(),
  ],
  debug: DEBUG,
  devtool: 'source-map',
  module: {
    preLoaders: [
      {
        test: /(\.js)$/,
        loader: 'eslint-loader',
        exclude: [/(node_modules)/, /(build)/],
      },
    ],
    loaders: [
      {
        test: /(\.js)$/,
        loader: 'babel',
        include: SRC,
      }
    ],
  },
  resolve: {
    root: SRC,
    extensions: ['', '.js']
  },
  eslint: {
    quiet: true,
    failOnWarning: false,
    failOnError: true
  },
};
module.exports = config;
