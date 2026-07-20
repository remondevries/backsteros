const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "Xcode 26 fmt workaround";

/**
 * Xcode 26+ Apple Clang rejects fmt 11.x consteval usage bundled by RN.
 * Patch fmt/base.h after pods install (see RN #55601 / Expo #44229).
 */
function withFmtXcodeFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");
      if (contents.includes(MARKER)) {
        return cfg;
      }

      const snippet = `
    # ${MARKER}: disable consteval in fmt 11.x (RN #55601 / Expo #44229)
    # Must run after react_native_post_install (which forces c++20 on pods).
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      unless content.include?('${MARKER}')
        patched = content.gsub(
          /^(#elif defined\\(__cpp_consteval\\)\\n#  define FMT_USE_CONSTEVAL) 1/,
          "// ${MARKER}: disable consteval\\n\\\\1 0"
        )
        if patched != content
          File.chmod(0644, fmt_base)
          File.write(fmt_base, patched)
        end
      end
    end
`;

      const anchor = /react_native_post_install\(\n(?:.*\n)*?    \)\n/;
      if (!anchor.test(contents)) {
        throw new Error(
          "withFmtXcodeFix: expected react_native_post_install in Podfile",
        );
      }
      contents = contents.replace(anchor, (match) => `${match}${snippet}`);
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
}

module.exports = withFmtXcodeFix;
