import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOUNDRY_ID_RE = /^[A-Za-z0-9]{16}$/;
const LINK_START_RE = /@(UUID|Embed)\[/g;
const DOCUMENT_TYPES = new Set([
  "ActiveEffect",
  "Actor",
  "Adventure",
  "AmbientLight",
  "AmbientSound",
  "Card",
  "Cards",
  "Combat",
  "Combatant",
  "Drawing",
  "Folder",
  "Item",
  "JournalEntry",
  "JournalEntryPage",
  "Macro",
  "Note",
  "Playlist",
  "PlaylistSound",
  "Region",
  "RollTable",
  "Scene",
  "TableResult",
  "Tile",
  "Token",
  "Wall",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  return files.sort((left, right) => left.localeCompare(right));
}

function getDocumentId(value, key = "") {
  if (isPlainObject(value) && typeof value._id === "string") return value._id;
  return FOUNDRY_ID_RE.test(key) ? key : null;
}

function indexDescendants(value, index, isRoot = true) {
  if (Array.isArray(value)) {
    for (const child of value) indexDescendants(child, index, false);
    return;
  }
  if (!isPlainObject(value)) return;

  if (!isRoot && typeof value._id === "string") {
    if (!index.has(value._id)) {
      index.set(value._id, value);
    } else if (index.get(value._id) !== value) {
      index.set(value._id, null);
    }
  }

  for (const child of Object.values(value)) {
    if (!isPlainObject(child) && !Array.isArray(child)) continue;
    indexDescendants(child, index, false);
  }
}

function makeRootDocument(value, key) {
  const id = getDocumentId(value, key);
  if (!id || !isPlainObject(value)) return null;
  const descendants = new Map();
  indexDescendants(value, descendants);
  return { id, key, value, descendants };
}

function addError(report, error) {
  report.errors.push(error);
  report.counts[error.code] = (report.counts[error.code] ?? 0) + 1;
}

function addWarning(report, warning) {
  report.warnings.push(warning);
  report.warningCounts[warning.code] = (report.warningCounts[warning.code] ?? 0) + 1;
}

function normalizeExceptions(value = {}) {
  const ignoredPackageIds = value.ignoredPackageIds ?? [];
  const ignoredPackIds = value.ignoredPackIds ?? [];
  if (
    !Array.isArray(ignoredPackageIds) ||
    !ignoredPackageIds.every((item) => typeof item === "string" && item.length > 0) ||
    !Array.isArray(ignoredPackIds) ||
    !ignoredPackIds.every((item) => typeof item === "string" && item.includes("."))
  ) {
    throw new Error("UUID exceptions must contain string arrays ignoredPackageIds and ignoredPackIds");
  }
  return {
    ignoredPackageIds: new Set(ignoredPackageIds),
    ignoredPackIds: new Set(ignoredPackIds),
  };
}

function getCompendiumIdentity(reference) {
  const candidate = reference.trim().replace(/^\[+/, "");
  const match = /^Compendium\.([^.]+)\.([^.]+)/.exec(candidate);
  if (!match) return null;
  return {
    packageId: match[1],
    packId: `${match[1]}.${match[2]}`,
  };
}

function getMatchingException(reference, exceptions) {
  const identity = getCompendiumIdentity(reference);
  if (!identity) return null;
  if (exceptions.ignoredPackIds.has(identity.packId)) {
    return `pack:${identity.packId}`;
  }
  if (exceptions.ignoredPackageIds.has(identity.packageId)) {
    return `package:${identity.packageId}`;
  }
  return null;
}

function parseCompendiumReference(reference) {
  const hashIndex = reference.indexOf("#");
  const withoutFragment = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
  const parts = withoutFragment.split(".");

  if (parts[0] !== "Compendium" || parts.length < 4) return null;

  const packId = `${parts[1]}.${parts[2]}`;
  if (parts.length === 4) {
    return {
      packId,
      segments: [{ documentType: null, id: parts[3] }],
    };
  }

  const segments = [];
  let cursor = 3;

  while (cursor < parts.length) {
    const documentType = parts[cursor++];
    if (!DOCUMENT_TYPES.has(documentType)) return null;

    const idParts = [];
    while (cursor < parts.length && (idParts.length === 0 || !DOCUMENT_TYPES.has(parts[cursor]))) {
      idParts.push(parts[cursor++]);
    }
    if (idParts.length === 0) return null;
    segments.push({ documentType, id: idParts.join(".") });
  }

  return segments.length > 0 ? { packId, segments } : null;
}

function validateCompendiumReference(reference, context, report) {
  const parsed = parseCompendiumReference(reference);
  if (!parsed) {
    addError(report, { ...context, code: "malformed-uuid", reference });
    return;
  }

  for (const segment of parsed.segments) {
    if (!FOUNDRY_ID_RE.test(segment.id)) {
      addError(report, {
        ...context,
        code: "name-based-uuid",
        reference,
        documentType: segment.documentType,
        value: segment.id,
      });
      return;
    }
  }

  const pack = report.packs.get(parsed.packId);
  if (!pack) {
    const packageId = parsed.packId.split(".", 1)[0];
    const issue = { ...context, reference, packId: parsed.packId };
    if (report.packageIds.has(packageId)) {
      addError(report, { ...issue, code: "missing-pack" });
    } else {
      addWarning(report, { ...issue, code: "external-pack-unchecked" });
    }
    return;
  }

  const [rootSegment, ...nestedSegments] = parsed.segments;
  if (pack.duplicateIds.has(rootSegment.id)) {
    addError(report, {
      ...context,
      code: "ambiguous-document",
      reference,
      packId: parsed.packId,
      id: rootSegment.id,
    });
    return;
  }
  const rootDocument = pack.roots.get(rootSegment.id);
  if (!rootDocument) {
    addError(report, {
      ...context,
      code: "missing-document",
      reference,
      packId: parsed.packId,
      documentType: rootSegment.documentType,
      id: rootSegment.id,
    });
    return;
  }

  let current = rootDocument;
  for (const segment of nestedSegments) {
    const nestedValue = current.descendants.get(segment.id);
    if (!nestedValue) {
      addError(report, {
        ...context,
        code: "missing-nested-document",
        reference,
        packId: parsed.packId,
        documentType: segment.documentType,
        id: segment.id,
      });
      return;
    }
    const descendants = new Map();
    indexDescendants(nestedValue, descendants);
    current = { id: segment.id, value: nestedValue, descendants };
  }

  report.validLinks += 1;
}

function validateRelativeReference(reference, context, rootDocument, report) {
  const id = reference.slice(1).split("#", 1)[0];
  if (!FOUNDRY_ID_RE.test(id)) {
    addError(report, { ...context, code: "name-based-uuid", reference, value: id });
    return;
  }
  if (!rootDocument || (rootDocument.id !== id && !rootDocument.descendants.get(id))) {
    addError(report, { ...context, code: "missing-relative-document", reference, id });
    return;
  }
  report.validLinks += 1;
}

function validateLink(type, rawReference, context, rootDocument, report) {
  const reference = type === "Embed" ? rawReference.trim().split(/\s+/, 1)[0] : rawReference.trim();
  const matchingException = getMatchingException(reference, report.exceptions);
  if (matchingException) {
    report.ignoredLinks.push({
      ...context,
      reference: rawReference,
      exception: matchingException,
    });
    return;
  }
  if (!reference || reference.startsWith("[")) {
    addError(report, { ...context, code: "malformed-uuid", reference: rawReference });
  } else if (reference.startsWith("Compendium.")) {
    validateCompendiumReference(reference, context, report);
  } else if (reference.startsWith(".")) {
    validateRelativeReference(reference, context, rootDocument, report);
  } else {
    addError(report, { ...context, code: "unverifiable-uuid", reference });
  }
}

function scanString(value, context, rootDocument, report) {
  LINK_START_RE.lastIndex = 0;
  let match;

  while ((match = LINK_START_RE.exec(value)) !== null) {
    const contentStart = LINK_START_RE.lastIndex;
    const contentEnd = value.indexOf("]", contentStart);
    if (contentEnd === -1) {
      addError(report, { ...context, code: "malformed-uuid", reference: value.slice(match.index) });
      break;
    }

    validateLink(match[1], value.slice(contentStart, contentEnd), context, rootDocument, report);
    report.scannedLinks += 1;
    LINK_START_RE.lastIndex = contentEnd + 1;
  }
}

function scanValue(value, context, rootDocument, report, jsonPath = "$") {
  if (typeof value === "string") {
    scanString(value, { ...context, jsonPath }, rootDocument, report);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanValue(child, context, rootDocument, report, `${jsonPath}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${jsonPath}.${key}`
      : `${jsonPath}[${JSON.stringify(key)}]`;
    scanValue(child, context, rootDocument, report, childPath);
  }
}

function inferPackId(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

export async function verifyUuidLinks({ root = "translate", exceptions = {} } = {}) {
  const absoluteRoot = path.resolve(root);
  const files = await collectJsonFiles(absoluteRoot);
  const report = {
    root: absoluteRoot,
    files: files.length,
    scannedLinks: 0,
    validLinks: 0,
    errors: [],
    counts: {},
    warnings: [],
    warningCounts: {},
    ignoredLinks: [],
    exceptions: normalizeExceptions(exceptions),
    packs: new Map(),
    packageIds: new Set(),
  };
  const parsedFiles = [];

  for (const filePath of files) {
    let value;
    try {
      value = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      addError(report, {
        code: "invalid-json",
        file: path.relative(absoluteRoot, filePath),
        message: error.message,
      });
      continue;
    }

    const relativePath = path.relative(absoluteRoot, filePath);
    const isPack = relativePath.split(path.sep).includes("packs");
    const roots = new Map();
    const duplicateIds = new Set();

    if (isPack && isPlainObject(value.entries)) {
      for (const [key, entry] of Object.entries(value.entries)) {
        const rootDocument = makeRootDocument(entry, key);
        if (!rootDocument) continue;
        if (roots.has(rootDocument.id)) {
          duplicateIds.add(rootDocument.id);
        } else {
          roots.set(rootDocument.id, rootDocument);
        }
      }
      const packId = inferPackId(filePath);
      report.packs.set(packId, { filePath, roots, duplicateIds });
      report.packageIds.add(packId.split(".", 1)[0]);
    }

    parsedFiles.push({ filePath, relativePath, value, roots });
  }

  for (const parsed of parsedFiles) {
    const context = { file: parsed.relativePath };
    if (parsed.roots.size === 0) {
      scanValue(parsed.value, context, null, report);
      continue;
    }

    for (const rootDocument of parsed.roots.values()) {
      scanValue(
        rootDocument.value,
        context,
        rootDocument,
        report,
        `$.entries[${JSON.stringify(rootDocument.key)}]`,
      );
    }
  }

  delete report.packs;
  delete report.packageIds;
  delete report.exceptions;
  return report;
}

function formatError(error) {
  const location = [error.file, error.jsonPath].filter(Boolean).join(" ");
  const target = error.reference ?? error.id ?? error.message ?? "";
  return `${error.code}: ${location}${target ? ` -> ${target}` : ""}`;
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? "translate" : process.argv[rootIndex + 1];
  if (!root) throw new Error("--root requires a directory");

  const exceptionsIndex = process.argv.indexOf("--exceptions");
  const exceptionsPath =
    exceptionsIndex === -1
      ? fileURLToPath(new URL("./uuid-exceptions.json", import.meta.url))
      : process.argv[exceptionsIndex + 1];
  if (exceptionsIndex !== -1 && !exceptionsPath) throw new Error("--exceptions requires a JSON file");
  const exceptions = process.argv.includes("--no-exceptions")
    ? {}
    : JSON.parse(await fs.readFile(exceptionsPath, "utf8"));

  const report = await verifyUuidLinks({ root, exceptions });
  console.log(
    `UUID verification: ${report.files} files, ${report.scannedLinks} links, ` +
      `${report.errors.length} errors, ${report.warnings.length} warnings, ` +
      `${report.ignoredLinks.length} ignored`,
  );

  for (const error of report.errors.slice(0, 50)) {
    console.error(`- ${formatError(error)}`);
  }
  if (report.errors.length > 50) {
    console.error(`- ... ${report.errors.length - 50} more errors`);
  }
  if (report.errors.length > 0) process.exitCode = 1;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
