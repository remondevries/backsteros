const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Apply containerBackground + non-removable chrome on generated Expo widget Swift files.
 * Per-widget colors are patched by matching the widget struct name.
 */
const WIDGET_BG_BY_FILE = {
  HomeGlanceHeaderWidget: {
    marker: "HomeGlanceHeaderWidget",
    color:
      "Color(red: 244.0 / 255.0, green: 241.0 / 255.0, blue: 234.0 / 255.0)",
  },
  HomeGlanceSectionsWidget: {
    marker: "HomeGlanceSectionsWidget",
    color: "Color(red: 13.0 / 255.0, green: 26.0 / 255.0, blue: 18.0 / 255.0)",
  },
};

function withSolidBlackWidgetBackground(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        "ExpoWidgetsTarget",
      );
      if (!fs.existsSync(dir)) return cfg;

      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".swift") || name === "index.swift") continue;
        const file = path.join(dir, name);
        let contents = fs.readFileSync(file, "utf8");
        let changed = false;

        const baseName = name.replace(/\.swift$/, "");
        const preset = WIDGET_BG_BY_FILE[baseName];
        const bgColor =
          preset?.color ??
          "Color(red: 0.0 / 255.0, green: 0.0 / 255.0, blue: 0.0 / 255.0)";

        const plain = "WidgetsEntryView(entry: entry)";
        if (
          contents.includes(plain) &&
          !contents.includes("containerBackground(for: .widget)")
        ) {
          const wrapped = [
            "Group {",
            "        if #available(iOS 17.0, *) {",
            "          WidgetsEntryView(entry: entry)",
            "            .containerBackground(for: .widget) {",
            `              ${bgColor}`,
            "            }",
            "        } else {",
            "          WidgetsEntryView(entry: entry)",
            "        }",
            "      }",
          ].join("\n");
          contents = contents.replace(plain, wrapped);
          changed = true;
        }

        if (
          contents.includes(".contentMarginsDisabled()") &&
          !contents.includes(".containerBackgroundRemovable(false)")
        ) {
          contents = contents.replace(
            ".contentMarginsDisabled()",
            ".contentMarginsDisabled()\n    .containerBackgroundRemovable(false)",
          );
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(file, contents, "utf8");
        }
      }
      return cfg;
    },
  ]);
}

module.exports = withSolidBlackWidgetBackground;
