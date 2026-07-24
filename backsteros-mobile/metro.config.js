const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Default Expo monorepo watch includes every workspace package (app/desktop/api),
// which slows Metro and can pull duplicate React. Only watch shared packages.
config.watchFolders = [
  path.resolve(workspaceRoot, "backsteros-packages/api-client"),
  path.resolve(workspaceRoot, "backsteros-packages/contracts"),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.nodeModulesPaths = nodeModulesPaths;

// Prefer mobile's React / RN (public-hoist-pattern in .npmrc) so other
// workspace apps cannot introduce a second copy.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

// Allow Metro to walk pnpm's nested node_modules (needed for packages like
// @react-navigation/core that sit beside @react-navigation/native in .pnpm).
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
