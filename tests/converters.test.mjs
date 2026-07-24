import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as converters from "../scripts/converters/converters.js";
import * as utils from "../scripts/utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

// Must match tests/capture-fixtures.mjs's UNDEFINED_SENTINEL exactly.
const UNDEFINED_SENTINEL = "__UNDEFINED__";

// Same reviver as tests/utils.test.mjs - turns the sentinel string back into a real `undefined`.
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

// ---------------------------------------------------------------------------------------
// range() / time() / duration() - `translateXValue(translation ?? value)`
// ---------------------------------------------------------------------------------------

describe("range() - delegates to translateRangeValue(translation ?? value)", () => {
  const cases = loadFixture("pluralization-range.json");
  const translationCase = cases.find((c) => c.note === "count=5");
  const valueCase = cases.find((c) => c.note === "mixed sentence");

  test("range - translation present wins over value (?? order)", () => {
    const value = "SHOULD_BE_IGNORED_VALUE";
    const translation = translationCase.args[0];
    const expected = utils.translateRangeValue(translation);
    expect(converters.range(value, translation)).toStrictEqual(expected);
  });

  test("range - translation absent (undefined) falls back to value", () => {
    const value = valueCase.args[0];
    const expected = utils.translateRangeValue(value);
    expect(converters.range(value, undefined)).toStrictEqual(expected);
  });

  test("range - translation explicitly null also falls back to value (?? treats null as nullish too, same as undefined)", () => {
    const value = valueCase.args[0];
    const expected = utils.translateRangeValue(value);
    expect(converters.range(value, null)).toStrictEqual(expected);
  });
});

describe("time() - delegates to translateTimeValue(translation ?? value)", () => {
  const cases = loadFixture("pluralization-time.json");
  const translationCase = cases.find((c) => c.note === "reaction keyword");
  const valueCase = cases.find((c) => c.note === "free action keyword");

  test("time - translation present wins over value (?? order)", () => {
    const value = "SHOULD_BE_IGNORED_VALUE";
    const translation = translationCase.args[0];
    const expected = utils.translateTimeValue(translation);
    expect(converters.time(value, translation)).toStrictEqual(expected);
  });

  test("time - translation absent (undefined) falls back to value", () => {
    const value = valueCase.args[0];
    const expected = utils.translateTimeValue(value);
    expect(converters.time(value, undefined)).toStrictEqual(expected);
  });
});

describe("duration() - same wiring as time(), also delegates to translateTimeValue", () => {
  const cases = loadFixture("pluralization-time.json");
  const valueCase = cases.find((c) => c.note === "reaction keyword");

  test("duration - delegates to translateTimeValue(translation ?? value) directly", () => {
    const value = valueCase.args[0];
    const expected = utils.translateTimeValue(value);
    expect(converters.duration(value, undefined)).toStrictEqual(expected);
  });

  test("duration - produces the same result as time() for identical arguments (both are aliases over translateTimeValue)", () => {
    const value = valueCase.args[0];
    const translation = "up to 1 hour";
    expect(converters.duration(value, translation)).toStrictEqual(converters.time(value, translation));
  });
});

// ---------------------------------------------------------------------------------------
// defaultMerge() - translateSystemRangeAndTime(mergeData(value, translation))
// ---------------------------------------------------------------------------------------

describe("defaultMerge() - delegates to translateSystemRangeAndTime(mergeData(value, translation))", () => {
  const systemCases = loadFixture("pluralization-system-range-time.json");
  const typicalCase = systemCases.find((c) => c.note === "typical PF2E spell system block");

  test("defaultMerge - nil translation: output matches the already-pinned translateSystemRangeAndTime fixture (mergeData is a no-op here)", () => {
    const value = structuredClone(typicalCase.args[0]);
    expect(converters.defaultMerge(value, undefined)).toStrictEqual(typicalCase.output);
  });

  test("defaultMerge - translation is merged in BEFORE range/time translation runs (merge-then-translate order, not the reverse)", () => {
    const value = { system: { range: { value: "30 feet" } } };
    const translation = { system: { range: { value: "60 feet" } } };
    const expected = utils.translateSystemRangeAndTime(utils.mergeData(value, translation));
    expect(converters.defaultMerge(value, translation)).toStrictEqual(expected);
    // Sanity: the merged leaf actually got pluralized by translateRangeValue, proving the
    // translate step really ran on the MERGED value, not the raw "60 feet" literal.
    expect(expected.system.range.value).not.toBe("60 feet");
  });

  // GAP-1 (P2-converters-charter.md, P2.1): same realistic multi-field PF2E structured
  // document used to pin mergeData directly (utils.test.mjs) also proven through the
  // defaultMerge delegation wrapper, so the built-in-converter swap is checked at both seams.
  test("defaultMerge - GAP-1: realistic multi-field PF2E structured document delegates through mergeData then translateSystemRangeAndTime", () => {
    const [structuredCase] = loadFixture("merge-data-structured-document.json");
    const [value, translation] = structuredCase.args;
    const expected = utils.translateSystemRangeAndTime(
      utils.mergeData(structuredClone(value), structuredClone(translation)),
    );
    expect(converters.defaultMerge(structuredClone(value), structuredClone(translation))).toStrictEqual(expected);
    // No range/time/duration fields are present in this document, so translateSystemRangeAndTime
    // is a no-op here - defaultMerge's output equals the pinned mergeData golden output directly.
    expect(converters.defaultMerge(structuredClone(value), structuredClone(translation))).toStrictEqual(structuredCase.output);
  });
});

// ---------------------------------------------------------------------------------------
// name() - delegates to formatTranslatedName(value, translation, params); drops data/tc/etc.
// ---------------------------------------------------------------------------------------

describe("name() - delegates to formatTranslatedName(value, translation, params); ignores data/tc/allTranslations/runtime", () => {
  const cases = loadFixture("html-original-details.json").formatTranslatedName;
  const blankCase = cases.find((c) => c.note === "blank translation -> original");
  const combinedCase = cases.find((c) => c.note === "showOriginal true -> combined");

  test("name - default 2-arg call, params default {} -> matches formatTranslatedName directly and matches its own fixture", () => {
    const [value, translation] = blankCase.args;
    const expected = utils.formatTranslatedName(value, translation);
    expect(converters.name(value, translation)).toStrictEqual(expected);
    expect(converters.name(value, translation)).toStrictEqual(blankCase.output);
  });

  test("name - data/tc/allTranslations/runtime positional args are accepted but never reach formatTranslatedName", () => {
    const [value, translation, params] = combinedCase.args;
    const expected = utils.formatTranslatedName(value, translation, params);
    const actual = converters.name(
      value,
      translation,
      "IGNORED_DATA",
      "IGNORED_TC",
      ["IGNORED"],
      { ignored: true },
      params,
    );
    expect(actual).toStrictEqual(expected);
    expect(actual).toStrictEqual(combinedCase.output);
  });
});

// ---------------------------------------------------------------------------------------
// description() - delegates to formatTranslatedDescription(value, translation, data, params)
// ---------------------------------------------------------------------------------------

describe("description() - delegates to formatTranslatedDescription(value, translation, data, params); data IS passed through (unlike name())", () => {
  const cases = loadFixture("html-original-details.json").formatTranslatedDescription;
  const sourceCase = cases.find(
    (c) => c.note === "no originalValue param, resolves from source._source.system.description.value",
  );

  test("description - 3rd positional arg (data) reaches formatTranslatedDescription's `source` param, ignored tc/allTranslations/runtime do not affect output", () => {
    const [value, translation, source, params] = sourceCase.args;
    const expected = utils.formatTranslatedDescription(value, translation, source, params);
    const actual = converters.description(
      value,
      translation,
      source,
      "IGNORED_TC",
      ["IGNORED"],
      { ignored: true },
      params,
    );
    expect(actual).toStrictEqual(expected);
    expect(actual).toStrictEqual(sourceCase.output);
  });
});

// ---------------------------------------------------------------------------------------
// rules() - delegates to convertRulesData(value, translation, params)
// ---------------------------------------------------------------------------------------

describe("rules() - delegates to convertRulesData(value, translation, params)", () => {
  const [caseEntry] = loadFixture("deep-merge-get-set.json").convertRulesDataNilLeaves;

  test("rules - passes value/translation straight through, ignores data/tc/allTranslations/runtime", () => {
    const [value, translation] = caseEntry.args;
    const expected = utils.convertRulesData(value, translation);
    const actual = converters.rules(
      value,
      translation,
      "IGNORED_DATA",
      "IGNORED_TC",
      ["IGNORED"],
      { ignored: true },
    );
    expect(actual).toStrictEqual(expected);
    expect(actual).toStrictEqual(caseEntry.output);
  });
});

// ---------------------------------------------------------------------------------------
// journal() - delegates to convertJournalPages(value, translation, { data, tc, allTranslations,
// runtime, params }) - reshapes 5 positional args into one context object.
// ---------------------------------------------------------------------------------------

describe("journal() - delegates to convertJournalPages(value, translation, { data, tc, allTranslations, runtime, params })", () => {
  const journalFixture = loadFixture("embedded-items.json").convertJournalPages[0];
  const [pages, translationMap] = journalFixture.args;

  test(
    "journal - 2-arg call matches the pinned convertJournalPages fixture output (unused context fields default to undefined either way) - Foundry-absent fallback branch (getModuleSetting has no game.settings under Node)",
    () => {
      expect(converters.journal(structuredClone(pages), structuredClone(translationMap))).toStrictEqual(journalFixture.output);
    },
  );

  test("journal - data/tc/allTranslations/runtime/params are bundled into a single context object, in that shape, before delegating", () => {
    const data = "IGNORED_DATA";
    const tc = "IGNORED_TC";
    const allTranslations = ["IGNORED"];
    const runtime = { ignored: true };
    const params = { showOriginal: true };

    const expected = utils.convertJournalPages(structuredClone(pages), structuredClone(translationMap), {
      data,
      tc,
      allTranslations,
      runtime,
      params,
    });
    const actual = converters.journal(
      structuredClone(pages),
      structuredClone(translationMap),
      data,
      tc,
      allTranslations,
      runtime,
      params,
    );
    expect(actual).toStrictEqual(expected);

    // Sanity: params really flowed through and changed the output (Original block appended),
    // proving `params` isn't silently dropped on the way into the bundled context object.
    const withoutParams = converters.journal(structuredClone(pages), structuredClone(translationMap));
    expect(actual).not.toStrictEqual(withoutParams);
  });
});

// ---------------------------------------------------------------------------------------
// items() - delegates to convertActorEmbeddedItems(value, translation, actor, { tc,
// allTranslations, runtime, params }) - actor stays positional, the rest is bundled.
// ---------------------------------------------------------------------------------------

describe("items() - delegates to convertActorEmbeddedItems(value, translation, actor, { tc, allTranslations, runtime, params })", () => {
  const itemsFixture = loadFixture("embedded-items.json").convertActorEmbeddedItems[0];
  const [dataArray, translationObj] = itemsFixture.args;

  test(
    "items - 2-arg call matches the pinned convertActorEmbeddedItems fixture output - compendium-absent fallback branch (no game.packs under Node)",
    () => {
      expect(converters.items(structuredClone(dataArray), structuredClone(translationObj))).toStrictEqual(itemsFixture.output);
    },
  );

  test(
    "items - actor stays a separate positional arg (not bundled into context); tc/allTranslations/runtime/params ARE bundled - compendium-absent fallback branch (no game.packs under Node)",
    () => {
      const actor = { id: "IGNORED_ACTOR" };
      const tc = "IGNORED_TC";
      const allTranslations = ["IGNORED"];
      const runtime = { ignored: true };
      const params = {};

      const expected = utils.convertActorEmbeddedItems(
        structuredClone(dataArray),
        structuredClone(translationObj),
        actor,
        { tc, allTranslations, runtime, params },
      );
      const actual = converters.items(
        structuredClone(dataArray),
        structuredClone(translationObj),
        actor,
        tc,
        allTranslations,
        runtime,
        params,
      );
      expect(actual).toStrictEqual(expected);
    },
  );
});

describe("prerequisites() - own logic beyond delegation: Array.isArray guard + mergeData/capitalizeFirst composition + optional sort", () => {
  test("prerequisites - non-array value is returned unchanged, translation ignored entirely", () => {
    const translation = [{ value: "навчений у скритності" }];
    expect(converters.prerequisites("not an array", translation)).toStrictEqual("not an array");
  });

  test("prerequisites - partial translation: merged entries capitalized, INCLUDING untranslated English entries (own capitalizeFirst pass, not just delegation)", () => {
    const value = [{ value: "trained in stealth" }, { value: "at least 1st level" }];
    const translation = [{ value: "навчений у скритності" }];
    expect(converters.prerequisites(value, translation)).toStrictEqual([
      { value: "Навчений у скритності" },
      { value: "At least 1st level" },
    ]);
  });
});
