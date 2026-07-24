#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  input: "./translate",
  output: "./TRANSLATION_PROGRESS.md",
  manifest: "./module.json",
  title: "PF2E UA Translation Progress",
};

const SKIP_TOP_LEVEL_KEYS = new Set([
  "label",
  "folders",
  "mapping",
  "_meta",
  "meta",
  "tags",
  "version",
  "pack",
  "packs",
  "lang",
  "language",
  "status",
]);

const GROUPS = {
  core: {
    title: "Core",
    emoji: "📘",
  },
  bestiaries: {
    title: "Bestiaries",
    emoji: "🐉",
  },
  modules: {
    title: "Modules",
    emoji: "🧩",
  },
};

const GROUP_ORDER = ["core", "bestiaries", "modules"];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputDir = path.resolve(args.input);
  const outputFile = path.resolve(args.output);
  const manifestFile = path.resolve(args.manifest);
  const moduleVersion = await readModuleVersion(manifestFile);

  const jsonFiles = await findJsonFiles(inputDir);
  const fileReports = [];

  for (const file of jsonFiles) {
    const relativeFile = path.relative(inputDir, file).replaceAll("\\", "/");

    let json;

    try {
      const raw = await fs.readFile(file, "utf8");
      json = JSON.parse(stripBom(raw));
    } catch (error) {
      fileReports.push({
        file: relativeFile,
        folder: getFileFolder(relativeFile),
        group: classifyFileGroup(relativeFile),
        comment: null,
        error: error.message,
        items: [],
        stats: createEmptyStats(),
      });
      continue;
    }

    const entries = extractTopLevelItems(json);

    const items = entries
      .map((entry) => analyzeItem(entry.key, entry.value))
      .filter((item) => item.translatableFields > 0);

    const stats = calculateStats(items);

    fileReports.push({
      file: relativeFile,
      folder: getFileFolder(relativeFile),
      group: classifyFileGroup(relativeFile),
      comment: getFileComment(json),
      error: null,
      items,
      stats,
    });
  }

  const totalStats = calculateStats(fileReports.flatMap((report) => report.items));

  const markdown = buildMarkdownReport({
    title: args.title,
    moduleVersion,
    totalStats,
    fileReports,
  });

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, markdown, "utf8");

  console.log(`Report generated: ${outputFile}`);
}

function parseArgs(argv) {
  const args = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--input" || arg === "-i") {
      args.input = argv[++i];
    } else if (arg === "--output" || arg === "-o") {
      args.output = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--title") {
      args.title = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node build/generate-translation-report.js --input ./translate --output ./TRANSLATION_PROGRESS.md

Options:
  -i, --input     Folder with translate JSON files
  -o, --output    Output markdown report
      --manifest  Path to module.json
      --title     Report title

Example:
  node build/generate-translation-report.js -i ./translate -o ./TRANSLATION_PROGRESS.md
`);
}

async function findJsonFiles(dir) {
  const result = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        result.push(fullPath);
      }
    }
  }

  await walk(dir);

  return result.sort((a, b) => a.localeCompare(b));
}

async function readModuleVersion(manifestFile) {
  let manifest;

  try {
    const raw = await fs.readFile(manifestFile, "utf8");
    manifest = JSON.parse(stripBom(raw));
  } catch (error) {
    throw new Error(`Failed to read module manifest ${manifestFile}: ${error.message}`);
  }

  if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error(`Module manifest ${manifestFile} does not contain a version`);
  }

  return manifest.version.trim();
}

function classifyFileGroup(relativeFile) {
  const normalized = relativeFile.toLowerCase();

  if (normalized.startsWith("modules/")) {
    return "modules";
  }

  if (
    normalized.includes("bestiary") ||
    normalized.includes("monster-core") ||
    normalized.includes("npc-gallery") ||
    normalized.includes("creatures") ||
    normalized.includes("creature")
  ) {
    return "bestiaries";
  }

  return "core";
}

function getFileFolder(relativeFile) {
  const parts = relativeFile.split("/");

  if (parts[0] === "modules" && parts[1]) {
    return parts[1];
  }

  if (parts[1]) {
    return parts[1];
  }

  return "root";
}

function getFileComment(root) {
  if (!isPlainObject(root) || typeof root.status !== "string") {
    return null;
  }

  return root.status.trim() || null;
}

function extractTopLevelItems(root) {
  if (Array.isArray(root)) {
    return root.map((value, index) => ({
      key: String(index),
      value,
    }));
  }

  if (!isPlainObject(root)) {
    return [];
  }

  if (isTranslationPair(root)) {
    return [{ key: ".", value: root }];
  }

  if (isPlainObject(root.entries)) {
    return Object.entries(root.entries).map(([key, value]) => ({
      key,
      value,
    }));
  }

  return Object.entries(root)
    .filter(([key, value]) => {
      if (SKIP_TOP_LEVEL_KEYS.has(key)) return false;
      return isPlainObject(value) || Array.isArray(value);
    })
    .flatMap(([key, value]) => {
      return collectTranslationPairs(value, formatPathKey(key)).map((pair) => ({
        key: pair.path,
        value: pair.node,
      }));
    });
}

function analyzeItem(key, value) {
  const translationPairs = collectTranslationPairs(value)
    .filter((pair) => isMeaningfulOriginal(pair.original));

  const translatedFields = translationPairs
    .filter((pair) => isMeaningfulTranslation(pair.translate))
    .length;

  let status = "untranslated";

  if (translatedFields === translationPairs.length && translationPairs.length > 0) {
    status = "translated";
  } else if (translatedFields > 0) {
    status = "partial";
  }

  return {
    key,
    status,
    done: isWorkbenchDone(value),
    translatableFields: translationPairs.length,
    translatedFields,
  };
}

function collectTranslationPairs(node, currentPath = "") {
  if (isTranslationPair(node)) {
    return [
      {
        path: currentPath || ".",
        original: node.original,
        translate: node.translate,
        node,
      },
    ];
  }

  if (Array.isArray(node)) {
    return node.flatMap((value, index) => {
      return collectTranslationPairs(value, `${currentPath}[${index}]`);
    });
  }

  if (isPlainObject(node)) {
    return Object.entries(node).flatMap(([key, value]) => {
      if (key === "original" || key === "translate") return [];

      const nextPath = currentPath
        ? `${currentPath}.${formatPathKey(key)}`
        : formatPathKey(key);

      return collectTranslationPairs(value, nextPath);
    });
  }

  return [];
}

function isTranslationPair(value) {
  return (
    isPlainObject(value) &&
    Object.prototype.hasOwnProperty.call(value, "original") &&
    Object.prototype.hasOwnProperty.call(value, "translate")
  );
}

function isMeaningfulOriginal(value) {
  return typeof value === "string" && normalizeText(value).length > 0;
}

function isMeaningfulTranslation(value) {
  return typeof value === "string" && normalizeText(value).length > 0;
}

function normalizeText(value) {
  return value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function isWorkbenchDone(item) {
  const candidates = [
    item?.translationWorkbench?.done,
    item?._meta?.translationWorkbench?.done,
    item?.meta?.translationWorkbench?.done,
  ];

  return candidates.some((value) => value === true || value === "true");
}

function calculateStats(items) {
  const stats = createEmptyStats();

  stats.total = items.length;

  for (const item of items) {
    if (item.status === "translated") {
      stats.translated++;
    } else if (item.status === "partial") {
      stats.partial++;
    } else {
      stats.untranslated++;
    }

    if (item.done) {
      stats.done++;
    }
  }

  stats.notTranslated = stats.total - stats.translated;
  stats.notDone = stats.total - stats.done;

  return stats;
}

function createEmptyStats() {
  return {
    total: 0,
    translated: 0,
    partial: 0,
    untranslated: 0,
    notTranslated: 0,
    done: 0,
    notDone: 0,
  };
}

function buildMarkdownReport({ title, moduleVersion, totalStats, fileReports }) {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Module version: \`${escapeMd(moduleVersion)}\``);
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(buildStatsTable(totalStats));
  lines.push("");

  lines.push(`### Progress`);
  lines.push("");
  lines.push(buildProgressTable(totalStats));
  lines.push("");

  lines.push(`Total items: **${totalStats.total}**`);
  lines.push("");

  lines.push(`## Detailed report`);
  lines.push("");

  for (const groupKey of GROUP_ORDER) {
    const groupReports = fileReports.filter((report) => report.group === groupKey);

    if (groupReports.length === 0) continue;

    lines.push(buildCategoryReportBlock(groupKey, groupReports));
    lines.push("");
  }

  return lines.join("\n");
}

function buildCategoryReportBlock(groupKey, groupReports) {
  const groupInfo = GROUPS[groupKey];
  const groupStats = calculateStats(groupReports.flatMap((report) => report.items));

  const lines = [];

  const summary = [
    `${groupInfo.emoji} ${groupInfo.title}`,
    `${groupStats.total} items`,
    `${percent(groupStats.translated, groupStats.total)} translated`,
    `${percent(groupStats.done, groupStats.total)} reviewed`,
  ].join(" — ");

  lines.push(`<details>`);
  lines.push(`<summary><strong>${escapeHtml(summary)}</strong></summary>`);
  lines.push("");

  for (const [folder, folderReports] of groupReportsByFolder(groupReports)) {
    lines.push(buildFolderReportBlock(folder, folderReports));
    lines.push("");
  }

  lines.push(`</details>`);

  return lines.join("\n");
}

function groupReportsByFolder(groupReports) {
  const grouped = new Map();

  for (const report of groupReports) {
    if (!grouped.has(report.folder)) {
      grouped.set(report.folder, []);
    }

    grouped.get(report.folder).push(report);
  }

  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function buildFolderReportBlock(folder, folderReports) {
  const folderStats = calculateStats(folderReports.flatMap((report) => report.items));
  const lines = [];
  const summary = [
    folder,
    `${folderReports.length} ${folderReports.length === 1 ? "file" : "files"}`,
    `${folderStats.total} items`,
    `${percent(folderStats.translated, folderStats.total)} translated`,
    `${percent(folderStats.done, folderStats.total)} reviewed`,
  ].join(" — ");

  lines.push(`<details>`);
  lines.push(`<summary><strong>${escapeHtml(summary)}</strong></summary>`);
  lines.push("");
  lines.push(`| File | Status | Comment | Items | Translated | Reviewed |`);
  lines.push(`|---|---|---|---:|---:|---:|`);

  for (const report of folderReports) {
    lines.push(buildFileReportRow(report));
  }

  lines.push("");
  lines.push(`</details>`);

  return lines.join("\n");
}

function buildFileReportRow(report) {
  const fileName = path.posix.basename(report.file);

  if (report.error) {
    return `| \`${escapeMd(fileName)}\` | Parse error | ${escapeMd(report.error)} | — | — | — |`;
  }

  const stats = report.stats;
  const comment = report.comment ? escapeMd(report.comment) : "—";

  const cells = [
    `\`${escapeMd(fileName)}\``,
    getFileStatus(stats),
    comment,
    stats.total,
    `${stats.translated} (${percent(stats.translated, stats.total)})`,
    `${stats.done} (${percent(stats.done, stats.total)})`,
  ];

  return `| ${cells.join(" | ")} |`;
}

function buildStatsTable(stats) {
  const lines = [];

  lines.push(`| Metric | Count | Percent |`);
  lines.push(`|---|---:|---:|`);
  lines.push(metricRow("Translated", stats.translated, stats.total));
  lines.push(metricRow("Partially translated", stats.partial, stats.total));
  lines.push(metricRow("Untranslated", stats.untranslated, stats.total));
  lines.push(metricRow("Workbench done", stats.done, stats.total));

  return lines.join("\n");
}

function buildProgressTable(stats) {
  const lines = [];

  lines.push(`| Metric | Progress | Percent |`);
  lines.push(`|---|---|---:|`);
  lines.push(progressRow("Translation", stats.translated, stats.total));
  lines.push(progressRow("Workbench done", stats.done, stats.total));

  return lines.join("\n");
}

function getFileStatus(stats) {
  if (stats.translated === stats.total && stats.done === stats.total) {
    return stats.total === 0 ? "⚪ Not started" : "🟢 Done";
  }

  if (stats.translated === stats.total) {
    return "🔵 Review";
  }

  if (stats.translated > 0 || stats.partial > 0) {
    return "🟡 Translate";
  }

  return "⚪ Not started";
}

function metricRow(label, value, total) {
  return `| ${label} | ${value} | ${percent(value, total)} |`;
}

function progressRow(label, value, total) {
  return `| ${label} | ${bar(value, total)} | ${percent(value, total)} |`;
}

function percent(value, total) {
  if (!total) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

function bar(value, total, size = 20) {
  if (!total) return "░".repeat(size);

  const filled = Math.round((value / total) * size);
  const empty = size - filled;

  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

function formatPathKey(key) {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$-]*$/.test(key)) {
    return key;
  }

  return JSON.stringify(key);
}

function escapeMd(value) {
  return String(value)
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
