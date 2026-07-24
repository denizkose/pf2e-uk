import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = "./translate";
const FINAL_OUTPUT_DIR = process.env.BUILD_OUTPUT_DIR || "./data";
const OUTPUT_DIR = `${FINAL_OUTPUT_DIR}.tmp-${process.pid}`;
const BACKUP_DIR = `${FINAL_OUTPUT_DIR}.backup-${process.pid}`;
const SKIP_EMPTY_TRANSLATIONS = true;
const REMOVE_ID = false;
const SKIP_EMPTY_FILES = true;
const SKIP_EMPTY_OBJECTS_AND_ARRAYS = true;
const SKIP_OBJECTS_WITH_ONLY_ID = true;
const SERVICE_KEYS = new Set(["_meta", "flags"]);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  if (SKIP_EMPTY_FILES && isEmptyBabeleFile(data)) {
    console.log("Skip empty file:", filePath);
    return {
      skipped: true,
      reason: "empty-file",
    };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, `${json}\n`, "utf8");

  return {
    skipped: false,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTranslationObject(value) {
  return (
    isPlainObject(value) &&
    Object.prototype.hasOwnProperty.call(value, "translate") &&
    Object.prototype.hasOwnProperty.call(value, "original")
  );
}

function isEmptyObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function isEmptyConvertedValue(value) {
  if (value === undefined) return true;

  if (!SKIP_EMPTY_OBJECTS_AND_ARRAYS) {
    return false;
  }

  return isEmptyObject(value) || isEmptyArray(value);
}

function hasOnlyId(value) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, "_id")
  );
}

function isEmptyBabeleFile(data) {
  if (data === undefined) return true;

  if (isEmptyObject(data)) return true;

  if (isPlainObject(data) && isPlainObject(data.entries)) {
    return Object.keys(data.entries).length === 0;
  }

  return false;
}

function convertTranslationObject(value) {
  const translated = value.translate;
  const original = value.original;

  if (typeof translated === "string" && translated.length > 0) {
    return translated;
  }

  if (SKIP_EMPTY_TRANSLATIONS) {
    return undefined;
  }

  return original;
}

function convertNode(node, key = null) {
  if (REMOVE_ID && key === "_id") {
    return undefined;
  }

  if (key && SERVICE_KEYS.has(key)) {
    return undefined;
  }

  if (isTranslationObject(node)) {
    return convertTranslationObject(node);
  }

  if (Array.isArray(node)) {
    const convertedArray = [];

    for (const item of node) {
      const converted = convertNode(item);

      if (isEmptyConvertedValue(converted)) {
        continue;
      }

      if (SKIP_OBJECTS_WITH_ONLY_ID && hasOnlyId(converted)) {
        continue;
      }

      convertedArray.push(converted);
    }

    if (SKIP_EMPTY_OBJECTS_AND_ARRAYS && convertedArray.length === 0) {
      return undefined;
    }

    return convertedArray;
  }

  if (isPlainObject(node)) {
    const result = {};

    for (const [childKey, childValue] of Object.entries(node)) {
      const converted = convertNode(childValue, childKey);

      if (isEmptyConvertedValue(converted)) {
        continue;
      }

      if (SKIP_OBJECTS_WITH_ONLY_ID && hasOnlyId(converted)) {
        continue;
      }

      result[childKey] = converted;
    }

    if (SKIP_EMPTY_OBJECTS_AND_ARRAYS && isEmptyObject(result)) {
      return undefined;
    }

    return result;
  }

  return node;
}

function getEntriesRoot(json) {
  if (isPlainObject(json.entries)) {
    return {
      wrapper: "entries",
      entries: json.entries,
    };
  }

  return {
    wrapper: null,
    entries: json,
  };
}

function buildBabeleJson(sourceJson) {
  const { wrapper, entries } = getEntriesRoot(sourceJson);
  const convertedEntries = convertNode(entries);

  if (wrapper === "entries") {
    if (isEmptyConvertedValue(convertedEntries)) {
      return {
        entries: {},
      };
    }

    return {
      entries: convertedEntries,
    };
  }

  return isEmptyConvertedValue(convertedEntries) ? {} : convertedEntries;
}

function getRelativeInputPath(inputFile) {
  return path.relative(path.resolve(SOURCE_DIR), path.resolve(inputFile));
}

function makeOutputFileName(inputFile) {
  const relativePath = getRelativeInputPath(inputFile);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Input file is outside SOURCE_DIR: ${inputFile}`);
  }

  return path.join(OUTPUT_DIR, relativePath);
}

async function collectJsonFilesRecursively(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const childFiles = await collectJsonFilesRecursively(fullPath);
      files.push(...childFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function getInputFiles() {
  const files = await collectJsonFilesRecursively(SOURCE_DIR);
  return files.sort((a, b) => a.localeCompare(b));
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function validateOutputPath() {
  const output = path.resolve(FINAL_OUTPUT_DIR);
  const root = path.parse(output).root;
  const forbidden = new Set([root, path.resolve("."), path.resolve(SOURCE_DIR)]);
  if (forbidden.has(output)) {
    throw new Error(`Unsafe build output directory: ${FINAL_OUTPUT_DIR}`);
  }
}

async function replaceOutputDirectory() {
  await fs.rm(BACKUP_DIR, { recursive: true, force: true });
  const hadPreviousOutput = await pathExists(FINAL_OUTPUT_DIR);

  if (hadPreviousOutput) {
    await fs.rename(FINAL_OUTPUT_DIR, BACKUP_DIR);
  }

  try {
    await fs.rename(OUTPUT_DIR, FINAL_OUTPUT_DIR);
    await fs.rm(BACKUP_DIR, { recursive: true, force: true });
  } catch (error) {
    if (hadPreviousOutput && !(await pathExists(FINAL_OUTPUT_DIR))) {
      await fs.rename(BACKUP_DIR, FINAL_OUTPUT_DIR);
    }
    throw error;
  }
}

async function main() {
  validateOutputPath();
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  try {
    const inputFiles = await getInputFiles();
    const report = {
      inputFiles: inputFiles.length,
      written: 0,
      skipped: 0,
    };

    for (const inputFile of inputFiles) {
      const sourceJson = await readJson(inputFile);
      const babeleJson = buildBabeleJson(sourceJson);
      const outputFile = makeOutputFileName(inputFile);
      const result = await writeJson(outputFile, babeleJson);
      report[result.skipped ? "skipped" : "written"] += 1;
    }

    await replaceOutputDirectory();
    console.log(
      `Data build complete: ${report.inputFiles} inputs, ${report.written} written, ${report.skipped} skipped`,
    );
    console.log(`Output: ${FINAL_OUTPUT_DIR}`);
  } catch (error) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    throw error;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
