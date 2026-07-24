/**
 * ROADMAP P1.2 characterization tests for the genuinely pure functions in scripts/utils.js.
 *
 * Every expected value is read from tests/fixtures/*.json (captured by
 * tests/capture-fixtures.mjs from the real, unmodified code) - no inline literals duplicating
 * fixture data, per P1.1's acceptance constraint.
 *
 * Scope per DECISIONS.md D-0001 / ROADMAP P1.4: this file covers ONLY the three genuinely pure
 * boundaries - UA pluralization (range + time units), deep merge/get/set edges, and HTML
 * <details> "Original" block formatting. Functions listed in tests/fixtures/meta.json ->
 * liveVerificationOnly are explicitly out of scope and are not asserted here.
 */
import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as utils from "../scripts/utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

// Must match tests/capture-fixtures.mjs's UNDEFINED_SENTINEL exactly.
const UNDEFINED_SENTINEL = "__UNDEFINED__";

// Reverses the capture harness's JSON.stringify replacer: turns the sentinel string back into
// a real JS `undefined`, recursively, so fixture args/output round-trip exactly as captured.
function reviveUndefined(value) {
  if (value === UNDEFINED_SENTINEL) return undefined;
  if (Array.isArray(value)) return value.map(reviveUndefined);
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = reviveUndefined(entryValue);
    }
    return result;
  }
  return value;
}

function loadFixture(filename) {
  const raw = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return reviveUndefined(JSON.parse(raw));
}

// Function-name -> live export lookup used by the generic case runner below.
const FN_MAP = {
  translateRangeValue: utils.translateRangeValue,
  translateTimeValue: utils.translateTimeValue,
  translateSystemRangeAndTime: utils.translateSystemRangeAndTime,
  formatTranslatedDescription: utils.formatTranslatedDescription,
  containsOriginalDetails: utils.containsOriginalDetails,
  extractOriginalFromExistingDetails: utils.extractOriginalFromExistingDetails,
  resolveOriginalDescription: utils.resolveOriginalDescription,
  formatTranslatedName: utils.formatTranslatedName,
  mergeData: utils.mergeData,
  mergePatch: utils.mergePatch,
  deepGet: utils.deepGet,
  deepSet: utils.deepSet,
  mergeFoundryObject: utils.mergeFoundryObject,
  clone: utils.clone,
  isObject: utils.isObject,
  isNil: utils.isNil,
  convertRulesData: utils.convertRulesData,
  stripOriginalUuidLabels: utils.stripOriginalUuidLabels,
  convertActorEmbeddedItem: utils.convertActorEmbeddedItem,
  convertEmbeddedSpellConsumable: utils.convertEmbeddedSpellConsumable,
};

/**
 * Runs one golden-output case: calls FN_MAP[fn](...args) and asserts the exact captured output.
 * Args are cloned before the call so mutation-in-place functions (e.g. deepSet) never corrupt
 * the fixture data backing a later assertion or test run.
 */
function runCase({ fn, args, output, note }) {
  test(`${fn} - ${note}`, () => {
    const target = FN_MAP[fn];
    expect(typeof target === "function").toBeTruthy();
    const callArgs = structuredClone(args);
    const result = target(...callArgs);
    expect(result).toStrictEqual(output);
  });
}

function runCases(cases) {
  for (const testCase of cases) runCase(testCase);
}

// ---------------------------------------------------------------------------------------
// Boundary 1: UA pluralization (range + time units)
// ---------------------------------------------------------------------------------------

describe('UA pluralization (range + time units)', () => {
  runCases(loadFixture("pluralization-range.json"));
  runCases(loadFixture("pluralization-time.json"));
  runCases(loadFixture("pluralization-system-range-time.json"));
});

// ---------------------------------------------------------------------------------------
// Boundary 2: HTML <details> "Original" block formatting
// ---------------------------------------------------------------------------------------

describe('HTML <details> "Original" block formatting', () => {
  const fixture = loadFixture("html-original-details.json");
  runCases(fixture.formatTranslatedDescription);
  runCases(fixture.containsOriginalDetails);
  runCases(fixture.extractOriginalFromExistingDetails);
  runCases(fixture.resolveOriginalDescription);
  runCases(fixture.formatTranslatedName);
});

// ---------------------------------------------------------------------------------------
// P2.5b (docs/P2.5b-lang-charter.md §5 step 1, bullet 3): localized "Original" label
// writer/reader round-trip. getOriginalDetailsOpen (original-details.js) now resolves its
// <summary> label through game.i18n.localize("PF2E-UK.OriginalLabel") when game.i18n is
// present, falling back to the literal "Original" otherwise - the fallback path is what the
// fixture cases above pin (game absent under Node). This test exercises the
// present-and-localized branch instead: a live uk world's summary should carry the localized
// label, and the reader (containsOriginalDetails) must still recognize it.
// ---------------------------------------------------------------------------------------

describe('formatTranslatedDescription - P2.5b: localized "Original" label round-trips through containsOriginalDetails', () => {
  test('game.i18n.localize("PF2E-UK.OriginalLabel") -> "Оригінал" is written into <summary> and recognized back by containsOriginalDetails', () => {
    const originalGame = globalThis.game;
    globalThis.game = {
      i18n: {
        localize(key) {
          return key === "PF2E-UK.OriginalLabel" ? "Оригінал" : key;
        },
      },
    };

    try {
      const output = utils.formatTranslatedDescription(
        "Original description text",
        "Translated description text",
        undefined,
        { showOriginal: true },
      );

      expect(output.includes("<summary>Оригінал</summary>")).toBeTruthy();
      expect(utils.containsOriginalDetails(output)).toBe(true);
    } finally {
      globalThis.game = originalGame;
    }
  });
});

// ---------------------------------------------------------------------------------------
// Boundary 3: deep merge / get / set edges (null, undefined, nested, array)
// ---------------------------------------------------------------------------------------

describe("deep merge / get / set edges (null, undefined, nested, array)", () => {
  const fixture = loadFixture("deep-merge-get-set.json");
  runCases(fixture.mergeData);
  runCases(fixture.mergePatch);
  runCases(fixture.deepGet);
  runCases(fixture.deepSet);
  runCases(fixture.mergeFoundryObject);
  runCases(fixture.clone);
  runCases(fixture.isObject);
  runCases(fixture.isNil);
  runCases(fixture.convertRulesDataNilLeaves);
});

// ---------------------------------------------------------------------------------------
// GAP-1 (P2-converters-charter.md, P2.1): mergeData over a realistic multi-field PF2E
// structured document (system.* block), not the range/time-shaped blocks the fixture above
// already covers. Written BEFORE the mergeData -> built-in `structured` refactor so a
// leaf-allowlist converter that drops a field mergeData copies through today shows up here.
// ---------------------------------------------------------------------------------------

describe("mergeData - GAP-1: realistic multi-field PF2E structured document", () => {
  const [structuredCase] = loadFixture("merge-data-structured-document.json");
  runCases([structuredCase]);

  // Deep equality does not check own-key insertion order, so verify it explicitly.
  test("mergeData - GAP-1: output key order matches Object.keys(data), not translation's key order/shape", () => {
    const [data, translation] = structuredCase.args;
    const result = utils.mergeData(structuredClone(data), structuredClone(translation));
    expect(Object.keys(result)).toStrictEqual(Object.keys(data));
    expect(Object.keys(result.publication)).toStrictEqual(Object.keys(data.publication));
    expect(Object.keys(translation)).not.toStrictEqual(Object.keys(data));
  });
});

// ---------------------------------------------------------------------------------------
// GAP-2 (P2-converters-charter.md, P2.2): stripOriginalUuidLabels golden cases (labeled UUID,
// #section suffix, multi-link string, non-string input) were already captured into
// uuid-compendium.json but replayed by no test. Wired here before the rulesConverter -> built-in
// `structured` swap touches this zone. All cases below run under plain Node, where
// foundry.utils.parseUuid is absent, so safeParseUuid always returns undefined and the label
// is NEVER dropped - see the note on each case. The label-drop path (originalName === label)
// is live-only (see live-verification.md) and is NOT exercised here.
// ---------------------------------------------------------------------------------------

describe("stripOriginalUuidLabels - GAP-2: captured @UUID label-strip cases", () => {
  const fixture = loadFixture("uuid-compendium.json");
  runCases(fixture.stripOriginalUuidLabels);
});

// ---------------------------------------------------------------------------------------
// GAP-3 (P2-converters-charter.md, P2.2): convertRulesData over a realistic, multi-entry
// system.rules array - unpinned before this test, per the charter's "Tester writes it first"
// note. Exercises the null-leaf short-circuit, the undefined-leaf filter-out, partial nested
// translation, @UUID-labeled string leaves through stripOriginalUuidLabels (default and
// params.stripUuidLabels:false), and an entirely-untranslated array element, all before the
// rulesConverter -> built-in `structured` swap touches this zone.
// ---------------------------------------------------------------------------------------

describe("convertRulesData - GAP-3: realistic system.rules array", () => {
  runCases(loadFixture("rules-data-structured.json"));
});

// ---------------------------------------------------------------------------------------
// GAP-4 (P2-converters-charter.md, P2.3): embedded-spell-scroll.json's convertEmbeddedSpellConsumable
// case and embedded-items.json's scroll case (convertActorEmbeddedItem) were already captured but
// replayed by no test - wired here before the item-pipeline -> built-in `document` converter swap
// touches this zone. Both cases lock the Node-observable fallback: under Node there is no
// game.packs, so findIndexByName/findIndexByUuid always miss and the spell-scroll-specific branch
// in convertEmbeddedSpellConsumable never fires - convertActorEmbeddedItem degrades to the same
// direct-translation fallback as a plain item, and convertEmbeddedSpellConsumable itself returns
// undefined regardless of input. The other three convertActorEmbeddedItem cases (lore/weapon/
// untranslated-weapon) are not wired here: they are already indirectly covered by the
// convertActorEmbeddedItems array-delegation test (converters.test.mjs "items()"), which replays
// the same three item shapes through the batch entry point.
// ---------------------------------------------------------------------------------------

describe("convertActorEmbeddedItem / convertEmbeddedSpellConsumable - GAP-4: wire captured-but-unreplayed fallback cases", () => {
  const embeddedItemsFixture = loadFixture("embedded-items.json");
  const scrollCase = embeddedItemsFixture.convertActorEmbeddedItem[2];

  test("GAP-4 fixture sanity: index 2 is the scroll case (guards against fixture reordering)", () => {
    expect(scrollCase.note).toMatch(/^type=consumable\/category=scroll/);
  });

  runCases([scrollCase]);
  runCases(loadFixture("embedded-spell-scroll.json").convertEmbeddedSpellConsumable);
});
