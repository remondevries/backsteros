const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Default Expo monorepo watch includes every workspace package (app/desktop/api),
// which slows Metro and can pull duplicate React. Only watch shared packages.
config.watchFolders = [
  path.resolve(workspaceRoot, "core/packages/api-client"),
  path.resolve(workspaceRoot, "core/packages/contracts"),
  path.resolve(workspaceRoot, "core/packages/powersync-schema"),
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
// Keep Expo default — required for @expo/metro-runtime / @expo/log-box.
config.resolver.unstable_enablePackageExports = true;

const sourceExts = config.resolver.sourceExts ?? [
  "ts",
  "tsx",
  "mjs",
  "js",
  "jsx",
  "json",
  "cjs",
];

const defaultResolveRequest = config.resolver.resolveRequest;

/**
 * Only for app-local relative imports: if the path is a directory under the
 * mobile project with an index.*, resolve that. Never interfere with
 * node_modules (e.g. @expo/metro-runtime's ../../LogBox).
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve =
    typeof defaultResolveRequest === "function"
      ? defaultResolveRequest
      : context.resolveRequest;

  // @expo/metro-runtime still requires ../../LogBox; map to @expo/log-box.
  if (
    moduleName === "../../LogBox" &&
    typeof context.originModulePath === "string" &&
    context.originModulePath.includes(`${path.sep}@expo${path.sep}metro-runtime${path.sep}`)
  ) {
    return resolve(context, "@expo/log-box/src/LogBox", platform);
  }

  if (
    moduleName.startsWith(".") &&
    !path.extname(moduleName) &&
    !moduleName.endsWith("/index") &&
    typeof context.originModulePath === "string" &&
    context.originModulePath.startsWith(projectRoot) &&
    !context.originModulePath.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    const abs = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (
      abs.startsWith(projectRoot) &&
      fs.existsSync(abs) &&
      fs.statSync(abs).isDirectory()
    ) {
      for (const ext of sourceExts) {
        const indexFile = path.join(abs, `index.${ext}`);
        if (fs.existsSync(indexFile)) {
          return { type: "sourceFile", filePath: indexFile };
        }
      }
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
