import * as esbuild from "esbuild";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);

/**
 * plugins-runtime imports "ses". Esbuild resolves that from the plugins tree,
 * which often has no hoisted copy — alias to frontend's install (or .pnpm).
 */
function resolveSes() {
  try {
    return require.resolve("ses");
  } catch {
    /* fall through */
  }
  const pnpmRoot = path.resolve("node_modules/.pnpm");
  if (!existsSync(pnpmRoot)) return null;
  for (const name of readdirSync(pnpmRoot)) {
    if (!name.startsWith("ses@")) continue;
    const pkg = path.join(pnpmRoot, name, "node_modules", "ses");
    if (existsSync(path.join(pkg, "package.json"))) {
      try {
        return require.resolve(pkg);
      } catch {
        return pkg;
      }
    }
  }
  return null;
}

/**
 * esbuild plugin to watch a directory recursively
 */
const watchExtraDirPlugin = {
  name: "watch-extra-dir",
  setup(build) {
    build.onLoad(
      { filter: /target\/index.js/, namespace: "file" },
      async (args) => {
        return {
          watchDirs: ["packages/ui/dist"],
        };
      },
    );
  },
};

const filter =
  /react-virtualized[/\\]dist[/\\]es[/\\]WindowScroller[/\\]utils[/\\]onScroll\.js$/;

const fixReactVirtualized = {
  name: "esbuild-plugin-react-virtualized",
  setup({ onLoad }) {
    onLoad({ filter }, async ({ path }) => {
      const code = await readFile(path, "utf8");
      const broken = `import { bpfrpt_proptype_WindowScroller } from "../WindowScroller.js";`;
      return { contents: code.replace(broken, "") };
    });
  },
};

const rebuildNotify = {
  name: "rebuild-notify",
  setup(build) {
    build.onEnd((result) => {
      // console.log(result);
      // [:main] Build completed. (1003 files, 1 compiled, 0 warnings, 9.06s)
      console.log(
        `[:libs] Build completed. (${result.errors.length} warnings, ${result.errors.length} errors)`,
      );
    });
  },
};

const sesPath = resolveSes();

const config = {
  entryPoints: ["target/index.js"],
  bundle: true,
  format: "esm",
  banner: {
    js: '"use strict";\nvar global = globalThis;',
  },
  outfile: "resources/public/js/libs.js",
  ...(sesPath ? { alias: { ses: sesPath } } : {}),
  plugins: [fixReactVirtualized, rebuildNotify, watchExtraDirPlugin],
};

async function watch() {
  let ctx = await esbuild.context(config);
  return ctx.watch();
}

if (process.argv.includes("--watch")) {
  await watch();
} else {
  const localConfig = { ...config, minify: true };
  await esbuild.build(localConfig);
}
