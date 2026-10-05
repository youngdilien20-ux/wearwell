const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, '../../src'),
  path.resolve(__dirname, '../../supabase'),
];

module.exports = config;
