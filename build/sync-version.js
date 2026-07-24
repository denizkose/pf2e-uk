import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReleaseUrls, getRepositoryUrl, SEMVER_RE } from "./release-config.js";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function syncVersion({ root = "." } = {}) {
  const packagePath = path.resolve(root, "package.json");
  const manifestPath = path.resolve(root, "module.json");
  const packageJson = await readJson(packagePath);
  const manifest = await readJson(manifestPath);

  if (!SEMVER_RE.test(packageJson.version)) {
    throw new Error(`Invalid semantic version: ${packageJson.version}`);
  }
  if (!manifest.id) {
    throw new Error("module.json must define id");
  }

  const repositoryUrl = getRepositoryUrl(packageJson.repository);
  const urls = getReleaseUrls({
    repositoryUrl,
    moduleId: manifest.id,
    version: packageJson.version,
  });

  Object.assign(manifest, { version: packageJson.version, ...urls });
  await writeJson(manifestPath, manifest);
  console.log(`module.json synchronized to ${packageJson.version}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  syncVersion().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
