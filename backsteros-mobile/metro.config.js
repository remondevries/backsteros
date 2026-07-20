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

// pnpm stores real package trees under node_modules/.pnpm; Metro must resolve
// through those paths for RN peer packages (gesture-handler, reanimated, …).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

config.resolver.unstable_enablePackageExports = true;

module.exports = config;
