import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const source = join(root, "src", "styles.css");
const target = join(root, "dist", "styles.css");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("[@backsteros/ui] Copied styles.css to dist/");
