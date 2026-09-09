import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(repositoryRoot, "apps", "web");

const KIB = 1024;
const budgets = {
  javascript: { each: 250 * KIB, total: 750 * KIB },
  css: { each: 75 * KIB, total: 150 * KIB },
  image: { each: 500 * KIB, total: 1_500 * KIB },
};

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesRecursively(path) : [path];
    }),
  );
  return files.flat();
}

async function existingFilesRecursively(directory) {
  try {
    return await filesRecursively(directory);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function formatBytes(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

async function measure(files, compressed) {
  return Promise.all(
    files.map(async (path) => {
      const bytes = await stat(path);
      const contents = compressed ? await readFile(path) : undefined;
      return {
        path,
        bytes: compressed ? gzipSync(contents).byteLength : bytes.size,
      };
    }),
  );
}

function enforce(name, assets, budget) {
  const failures = [];
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);

  for (const asset of assets) {
    if (asset.bytes > budget.each) {
      failures.push(
        `${name} asset ${asset.path} is ${formatBytes(asset.bytes)}; maximum is ${formatBytes(budget.each)}.`,
      );
    }
  }
  if (total > budget.total) {
    failures.push(
      `${name} total is ${formatBytes(total)}; maximum is ${formatBytes(budget.total)}.`,
    );
  }

  console.log(
    `${name}: ${assets.length} asset(s), ${formatBytes(total)} total (limit ${formatBytes(budget.total)}).`,
  );
  return failures;
}

const staticRoot = join(webRoot, ".next", "static");
const staticFiles = await existingFilesRecursively(staticRoot);
if (staticFiles.length === 0) {
  throw new Error(
    "No Next.js static build output found. Run pnpm build first.",
  );
}

const publicFiles = await existingFilesRecursively(join(webRoot, "public"));
const javascript = await measure(
  staticFiles.filter((path) => extname(path) === ".js"),
  true,
);
const css = await measure(
  staticFiles.filter((path) => extname(path) === ".css"),
  true,
);
const images = await measure(
  publicFiles.filter((path) => /\.(avif|gif|jpe?g|png|svg|webp)$/iu.test(path)),
  false,
);

const failures = [
  ...enforce("Gzipped JavaScript", javascript, budgets.javascript),
  ...enforce("Gzipped CSS", css, budgets.css),
  ...enforce("Public images", images, budgets.image),
];

if (failures.length > 0) {
  throw new Error(`Web performance budgets exceeded:\n${failures.join("\n")}`);
}
