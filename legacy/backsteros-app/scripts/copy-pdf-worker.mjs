import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicDir = join(projectRoot, "public");

const workers = [
  {
    source: join(
      projectRoot,
      "node_modules",
      "pdfjs-dist",
      "build",
      "pdf.worker.min.mjs",
    ),
    target: join(publicDir, "pdf.worker.min.mjs"),
    label: "pdf.worker.min.mjs",
  },
  {
    source: join(
      projectRoot,
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    ),
    target: join(publicDir, "pdf.legacy.worker.min.mjs"),
    label: "pdf.legacy.worker.min.mjs",
  },
  {
    source: join(projectRoot, "node_modules", "pdfjs-dist", "wasm", "openjpeg.wasm"),
    target: join(publicDir, "openjpeg.wasm"),
    label: "openjpeg.wasm",
  },
  {
    source: join(projectRoot, "node_modules", "pdfjs-dist", "wasm", "qcms_bg.wasm"),
    target: join(publicDir, "qcms_bg.wasm"),
    label: "qcms_bg.wasm",
  },
];

let copied = 0;

for (const worker of workers) {
  if (!existsSync(worker.source)) {
    console.warn(`[copy-pdf-worker] ${worker.label} not installed — skipping`);
    continue;
  }

  mkdirSync(dirname(worker.target), { recursive: true });
  copyFileSync(worker.source, worker.target);
  copied += 1;
  console.log(`[copy-pdf-worker] Copied ${worker.label} to public/`);
}

if (copied === 0) {
  process.exit(0);
}
