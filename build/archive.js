import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";

const moduleDir = path.resolve(process.argv[2] ?? ".");
const outDir = path.resolve(process.argv[3] ?? "dist");
const includedPaths = ["module.json", "css", "data", "lang", "scripts"];

async function readManifest() {
  const manifestPath = path.join(moduleDir, "module.json");
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, "utf8"));
  if (!manifest.id || !manifest.version) {
    throw new Error("module.json must contain id and version");
  }
  return manifest;
}

async function verifyInputs() {
  for (const item of includedPaths) {
    await fsPromises.access(path.join(moduleDir, item));
  }
}

async function createArchive() {
  const manifest = await readManifest();
  await verifyInputs();
  await fsPromises.mkdir(outDir, { recursive: true });

  const zipName = `${manifest.id}-${manifest.version}.zip`;
  const zipPath = path.join(outDir, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });

  archive.pipe(output);
  for (const item of includedPaths) {
    const fullPath = path.join(moduleDir, item);
    const stat = await fsPromises.stat(fullPath);
    if (stat.isDirectory()) {
      archive.directory(fullPath, item);
    } else {
      archive.file(fullPath, { name: item });
    }
  }

  await archive.finalize();
  await completed;
  console.log(`Archive created: ${path.relative(process.cwd(), zipPath)}`);
  console.log(`Archive size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MiB`);
}

createArchive().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
