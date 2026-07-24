import { afterEach, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportScript = path.join(projectRoot, "build", "generate-translation-report.js");
let tempDir;

afterEach(async () => {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

test("detailed report groups compact file rows by source folder", async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "translation-report-"));
  const inputDir = path.join(tempDir, "translate");
  const outputFile = path.join(tempDir, "report.md");
  const manifestFile = path.join(tempDir, "module.json");

  await writeJson(manifestFile, { version: "9.8.7" });

  await writeJson(
    path.join(
      inputDir,
      "modules",
      "pf2e-animal-companions",
      "packs",
      "companion-feats.json"
    ),
    {
      status: "reviewed. check full",
      entries: {
        Companion: {
          name: { original: "Companion", translate: "Translated companion" },
          translationWorkbench: { done: true },
        },
      },
    }
  );

  await writeJson(path.join(inputDir, "pf2e", "packs", "sample-bestiary.json"), {
    status: "old",
    entries: {
      Creature: {
        name: { original: "Creature", translate: "" },
      },
    },
  });

  await writeJson(path.join(inputDir, "pf2e", "packs", "translate-file.json"), {
    entries: {
      Item: {
        name: { original: "Item", translate: "Translated item" },
        description: { original: "Description", translate: "" },
      },
    },
  });

  await writeJson(path.join(inputDir, "pf2e", "packs", "review-file.json"), {
    entries: {
      Item: {
        name: { original: "Item", translate: "Translated item" },
      },
    },
  });

  await writeJson(path.join(inputDir, "pf2e", "lang", "core.json"), {
    status: "manual",
    Greeting: { original: "Hello", translate: "Вітаю" },
  });

  await execFileAsync(process.execPath, [
    reportScript,
    "--input",
    inputDir,
    "--output",
    outputFile,
    "--manifest",
    manifestFile,
  ]);

  const report = await fs.readFile(outputFile, "utf8");
  const detailedReport = report.slice(report.indexOf("## Detailed report"));

  expect(report).toMatch(/Module version: `9\.8\.7`/);
  expect(report).not.toMatch(/Generated:|Overall charts|```mermaid/);
  expect(detailedReport).toMatch(/Core/);
  expect(detailedReport).toMatch(/Bestiaries/);
  expect(detailedReport).toMatch(/Modules/);
  expect(detailedReport).toMatch(/pf2e-animal-companions — 1 file/);
  expect(detailedReport).toMatch(/lang — 1 file/);
  expect(detailedReport).toMatch(/packs — 2 files/);
  expect(detailedReport).toMatch(/\| File \| Status \| Comment \| Items \| Translated \| Reviewed \|/);
  expect(detailedReport).toMatch(/`companion-feats\.json`/);
  expect(detailedReport).toMatch(/\| 🟢 Done \| reviewed\. check full \|/);
  expect(detailedReport).toMatch(/`translate-file\.json` \| 🟡 Translate \|/);
  expect(detailedReport).toMatch(/`review-file\.json` \| 🔵 Review \|/);
  expect(detailedReport).toMatch(/`sample-bestiary\.json` \| ⚪ Not started \| old \|/);
  expect(detailedReport).not.toMatch(/Partial|Untranslated/);
  expect(detailedReport).not.toMatch(/\| \|$/m);
  expect(detailedReport).not.toMatch(/modules\/pf2e-animal-companions/);

  const coreStart = detailedReport.indexOf("Core");
  const bestiariesStart = detailedReport.indexOf("Bestiaries");
  const modulesStart = detailedReport.indexOf("Modules");
  const coreSection = detailedReport.slice(coreStart, bestiariesStart);

  expect(coreStart < bestiariesStart && bestiariesStart < modulesStart).toBeTruthy();
  expect(coreSection).not.toMatch(/pf2e-animal-companions/);

  const detailedLines = detailedReport.split("\n");
  const groupingSummaries = detailedLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith("<summary><strong>"));

  expect(groupingSummaries.length >= 7).toBeTruthy();
  for (const { index } of groupingSummaries) {
    expect(detailedLines[index - 1]).toBe("<details>");
  }
});

test("system localization files count every translation pair as an item", async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "translation-report-"));
  const inputDir = path.join(tempDir, "translate");
  const outputFile = path.join(tempDir, "report.md");
  const manifestFile = path.join(tempDir, "module.json");

  await writeJson(manifestFile, { version: "9.8.7" });

  await writeJson(path.join(inputDir, "pf2e", "lang", "action-uk.json"), {
    PF2E: {
      Action: {
        ApplyEffect: { original: "Apply Effect", translate: "" },
        Range: {
          IncrementN: {
            original: "Range Increment {n} ft.",
            translate: "Інтервал дистанції {n} футів",
          },
          MaxN: { original: "Range {n} ft.", translate: "" },
        },
      },
    },
  });

  await writeJson(
    path.join(
      inputDir,
      "modules",
      "pf2e-animal-companions",
      "pf2e-animal-companions.json"
    ),
    {
      COMP: {
        Prompt: {
          IsSpecialized: {
            original: "Is the companion specialized?",
            translate: "Чи спеціалізований компаньйон?",
          },
          Specialized: {
            original: "Select your companion's specialization",
            translate: "",
          },
        },
      },
    }
  );

  await execFileAsync(process.execPath, [
    reportScript,
    "--input",
    inputDir,
    "--output",
    outputFile,
    "--manifest",
    manifestFile,
  ]);

  const report = await fs.readFile(outputFile, "utf8");
  const actionRow = report
    .split("\n")
    .find((line) => line.includes("`action-uk.json`"));
  const moduleRow = report
    .split("\n")
    .find((line) => line.includes("`pf2e-animal-companions.json`"));

  expect(report).toMatch(/Total items: \*\*5\*\*/);
  expect(report).toMatch(/\| Partially translated \| 0 \| 0\.00% \|/);
  expect(actionRow).toContain("| 3 | 1 (33.33%) | 0 (0.00%) |");
  expect(moduleRow).toContain("| 2 | 1 (50.00%) | 0 (0.00%) |");
});

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
