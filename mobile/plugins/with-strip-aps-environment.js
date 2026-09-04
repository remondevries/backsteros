const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * expo-notifications adds `aps-environment`, which blocks local device signing
 * for this project. Widgets still need App Groups — strip push only.
 */
function withStripApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (cfg.modResults && "aps-environment" in cfg.modResults) {
      delete cfg.modResults["aps-environment"];
    }
    return cfg;
  });
}

module.exports = withStripApsEnvironment;
