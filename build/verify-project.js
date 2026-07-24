import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReleaseUrls, getRepositoryUrl, SEMVER_RE } from "./release-config.js";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectJsonFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function addMismatch(errors, name, actual, expected) {
  if (actual !== expected) {
    errors.push(`${name} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function validateRelativeAssetPath(errors, assetPath, field) {
  const normalized = assetPath.replace(/\\/g, "/");
  const unsafe =
    path.isAbsolute(assetPath) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    /^[a-z]+:\/\//i.test(normalized);
  if (unsafe) {
    errors.push(`${field} contains an unsafe module path: ${assetPath}`);
  }
  return !unsafe;
}

export async function verifyProject({ root = ".", tag = null } = {}) {
  const absoluteRoot = path.resolve(root);
  const errors = [];
  const packageJson = await readJson(path.join(absoluteRoot, "package.json"));
  const packageLock = await readJson(path.join(absoluteRoot, "package-lock.json"));
  const manifest = await readJson(path.join(absoluteRoot, "module.json"));

  if (!SEMVER_RE.test(packageJson.version)) {
    errors.push(`package.json has an invalid semantic version: ${packageJson.version}`);
  }
  addMismatch(errors, "module.json version", manifest.version, packageJson.version);
  addMismatch(errors, "package-lock.json version", packageLock.version, packageJson.version);
  addMismatch(errors, "package-lock.json root version", packageLock.packages?.[""]?.version, packageJson.version);

  const repositoryUrl = getRepositoryUrl(packageJson.repository);
  const expectedUrls = getReleaseUrls({
    repositoryUrl,
    moduleId: manifest.id,
    version: packageJson.version,
  });
  for (const [field, expected] of Object.entries(expectedUrls)) {
    addMismatch(errors, `module.json ${field}`, manifest[field], expected);
  }

  if (tag) {
    addMismatch(errors, "release tag", tag, `v${packageJson.version}`);
  }

  const assetPaths = [
    ...(manifest.esmodules ?? []),
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((language) => language.path),
  ];
  for (const assetPath of assetPaths) {
    const safe = validateRelativeAssetPath(errors, assetPath, "module.json");
    if (safe && !(await exists(path.join(absoluteRoot, assetPath)))) {
      errors.push(`module.json asset does not exist: ${assetPath}`);
    }
  }

  for (const directory of ["css", "data", "lang", "scripts"]) {
    if (!(await exists(path.join(absoluteRoot, directory)))) {
      errors.push(`Required release directory does not exist: ${directory}`);
    }
  }

  const dataRoot = path.join(absoluteRoot, "data");
  if (await exists(dataRoot)) {
    for (const filePath of await collectJsonFiles(dataRoot)) {
      try {
        await readJson(filePath);
      } catch (error) {
        errors.push(`Invalid generated JSON ${path.relative(absoluteRoot, filePath)}: ${error.message}`);
      }
    }
  }

  const buildEntries = await fs.readdir(path.join(absoluteRoot, "build"), { withFileTypes: true });
  const buildScripts = buildEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);
  for (const fileName of buildScripts) {
    const source = await fs.readFile(path.join(absoluteRoot, "build", fileName), "utf8");
    if (/[\u0400-\u04FF]/u.test(source)) {
      errors.push(`Pipeline script contains Cyrillic text: build/${fileName}`);
    }
    if (
      /(?:^|["'\s(])(?:[A-Za-z]:\\|[A-Za-z]:\/)/m.test(source) ||
      /\/(?:Users|home)\//.test(source)
    ) {
      errors.push(`Pipeline script contains a machine-local path: build/${fileName}`);
    }
  }

  return { errors, version: packageJson.version, moduleId: manifest.id };
}

async function main() {
  const tagIndex = process.argv.indexOf("--tag");
  const tag = tagIndex === -1 ? null : process.argv[tagIndex + 1];
  if (tagIndex !== -1 && !tag) throw new Error("--tag requires a value");

  const result = await verifyProject({ tag });
  if (result.errors.length > 0) {
    console.error(`Project verification failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Project verification passed for ${result.moduleId} ${result.version}`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
