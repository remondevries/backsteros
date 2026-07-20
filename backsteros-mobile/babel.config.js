module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "@babel/plugin-transform-async-generator-functions",
      // Must be listed last — see react-native-reanimated docs.
      "react-native-reanimated/plugin",
    ],
  };
};
