#!/usr/bin/env node
/**
 * Capture harness for ROADMAP P1.1.
 *
 * Imports the REAL exports of scripts/utils.js and calls them with representative
 * PF2E/Babele-shaped inputs, then writes the actual (not hand-authored) return values
 * into tests/fixtures/*.json as golden output for the P1.2/P1.3 characterization tests.
 *
 * Re-runnable and deterministic: run twice and diff tests/fixtures/ - must be byte-identical.
 * No stub of any Foundry global is installed (see report) - scripts/utils.js imports and
 * runs cleanly under plain Node with `game`/`foundry`/`document`/etc. all absent, taking
 * whatever fallback branch the source already defines for that case. Functions that only
 * do meaningful work when a real Foundry/Babele runtime is present are NOT captured here -
 * see the `liveVerificationOnly` list in meta.json.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import * as utils from "../scripts/utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

// Sentinel used (via a JSON.stringify replacer) to represent a real JS `undefined` that
// appears as an object property value or inside an array in a captured output - JSON has
// no `undefined`, and dropping such keys silently would lose real, observed behavior
// (e.g. scripts/utils.js's convertRulesData intentionally OMITS keys whose merged value
// is undefined - see the `deep-merge-get-set` "convertRulesData nil leaves" case below).
const UNDEFINED_SENTINEL = "__UNDEFINED__";

function jsonReplacer(_key, value) {
  return value === undefined ? UNDEFINED_SENTINEL : value;
}

/**
 * Calls `fn` with `args` (a plain-data array; use fewer elements to mean "argument
 * omitted / undefined" rather than encoding `undefined` inside the array).
 * Args are snapshotted with structuredClone BEFORE the call so mutation-in-place
 * functions (e.g. deepSet) don't corrupt the recorded input.
 */
function capture(fn, args, note = undefined) {
  const recordedArgs = structuredClone(args);
  const callArgs = structuredClone(args);
  const output = fn(...callArgs);
  const entry = { args: recordedArgs, output };
  if (note) entry.note = note;
  return entry;
}

function captureNamed(fnName, fn, cases) {
  return cases.map(({ args, note }) => ({ fn: fnName, ...capture(fn, args, note) }));
}

function writeFixture(filename, data) {
  const path = join(FIXTURES_DIR, filename);
  writeFileSync(path, `${JSON.stringify(data, jsonReplacer, 2)}\n`, "utf8");
  return path;
}

// ---------------------------------------------------------------------------------------
// 1. UA pluralization - translateRangeValue (feet, miles)
// ---------------------------------------------------------------------------------------

// Bucket coverage required by ROADMAP P1.4: 1 / 2-4 / 5+ / 11-14, plus boundary neighbours
// (10, 15, 21, 24, 25 ...), zero, negative, and non-integer (comma-decimal) numbers.
const PLURAL_NUMBERS = [
  1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 20, 21, 24, 25, 31,
  100, 101, 104, 105, 111, 114, 120, 121, 124, 125,
  0, -1, -11, 1.5,
];
const UP_TO_NUMBERS = [1, 2, 5, 11, 24];
const ALIAS_NUMBERS = [1, 3, 11];

function buildUnitPluralCases(unitWord, aliasForms) {
  const cases = [];

  for (const n of PLURAL_NUMBERS) {
    cases.push({ args: [`${n} ${unitWord}`], note: `count=${n}` });
  }
  for (const n of UP_TO_NUMBERS) {
    cases.push({ args: [`up to ${n} ${unitWord}`], note: `up-to count=${n}` });
  }
  for (const form of aliasForms) {
    for (const n of ALIAS_NUMBERS) {
      cases.push({ args: [`${n} ${form}`], note: `alias form="${form}" count=${n}` });
    }
  }
  // Comma-decimal (non-integer) input.
  cases.push({ args: [`3,5 ${unitWord}`], note: "comma-decimal (non-integer)" });

  return cases;
}

const rangeCases = [
  { args: ["touch"], note: "touch keyword" },
  { args: ["30 feet, then touch"], note: "mixed sentence" },
  { args: [""], note: "empty string" },
  { args: [null], note: "non-string input (null passthrough)" },
  { args: [42], note: "non-string input (number passthrough)" },
  ...buildUnitPluralCases("feet", ["feet", "feets", "foot", "ft", "ft."]),
  ...buildUnitPluralCases("miles", ["miles", "mile", "mi", "mi."]),
  { args: ["feet"], note: "bare unit, no number (fallback branch)" },
  { args: ["foot"], note: "bare unit, no number (fallback branch)" },
  { args: ["miles"], note: "bare unit, no number (fallback branch)" },
  { args: ["mile"], note: "bare unit, no number (fallback branch)" },
];

const timeCases = [
  { args: ["free action"], note: "free action keyword" },
  { args: ["free-action"], note: "free-action (hyphenated) keyword" },
  { args: ["reaction"], note: "reaction keyword" },
  { args: [""], note: "empty string" },
  { args: [null], note: "non-string input (null passthrough)" },
  ...buildUnitPluralCases("actions", ["actions", "action"]),
  ...buildUnitPluralCases("rounds", ["rounds", "round"]),
  ...buildUnitPluralCases("minutes", ["minutes", "minute", "mins", "min", "min."]),
  ...buildUnitPluralCases("hours", ["hours", "hour", "hrs", "hr", "hr."]),
  ...buildUnitPluralCases("days", ["days", "day"]),
];

const pluralizationRangeFixture = captureNamed("translateRangeValue", utils.translateRangeValue, rangeCases);
const pluralizationTimeFixture = captureNamed("translateTimeValue", utils.translateTimeValue, timeCases);

// translateSystemRangeAndTime - document-shaped wrapper around the two functions above.
const systemRangeTimeCases = [
  {
    args: [{ system: { range: { value: "30 feet" }, time: { value: "2 actions" }, duration: { value: "up to 1 minute" } } }],
    note: "typical PF2E spell system block",
  },
  {
    args: [{ range: { value: "60 feet" }, time: { value: "1 reaction" } }],
    note: "top-level (non-system) range/time shape",
  },
  { args: [{ system: { range: { value: 30 } } }], note: "non-string leaf left untouched" },
  { args: ["not an object"], note: "non-object input returned as-is" },
];
const translateSystemRangeAndTimeFixture = captureNamed(
  "translateSystemRangeAndTime",
  utils.translateSystemRangeAndTime,
  systemRangeTimeCases,
);

writeFixture("pluralization-range.json", pluralizationRangeFixture);
writeFixture("pluralization-time.json", pluralizationTimeFixture);
writeFixture("pluralization-system-range-time.json", translateSystemRangeAndTimeFixture);

// ---------------------------------------------------------------------------------------
// 2. HTML <details> "Original" block formatting
// ---------------------------------------------------------------------------------------

const originalDoc = {
  _source: { system: { description: { value: "<p>Source-derived original text.</p>" } } },
  system: { description: { value: "<p>Live original text.</p>" } },
};

const babelePayloadDoc = {
  flags: { babele: { originalPayload: { description: "<p>Payload-derived original.</p>" } } },
};

const formatTranslatedDescriptionCases = [
  {
    args: ["<p>Original EN</p>", undefined],
    note: "blank translation -> returns original unchanged",
  },
  {
    args: ["<p>Original EN</p>", ""],
    note: "empty-string translation counts as blank -> returns original",
  },
  {
    args: ["<p>Original EN</p>", "<p>Переклад</p>", undefined, { showOriginal: false }],
    note: "showOriginal explicitly false -> no details block appended",
  },
  {
    args: ["<p>Original EN</p>", "<p>Переклад</p>", undefined, { showOriginal: true }],
    note: "showOriginal true, no source -> falls back to originalValue param",
  },
  {
    args: ["<p>Original EN</p>", "<p>Переклад</p>", undefined, { showOriginal: true, skipOriginal: true }],
    note: "skipOriginal true overrides showOriginal -> no details block",
  },
  {
    args: [
      "<p>Original EN</p>",
      '<p>Переклад</p><details data-pf2e-uk-original="true"><summary>Original</summary><p>Already here</p></details>',
      undefined,
      { showOriginal: true },
    ],
    note: "translation already contains an Original block -> not duplicated",
  },
  {
    args: [undefined, "<p>Переклад</p>", originalDoc, { showOriginal: true }],
    note: "no originalValue param, resolves from source._source.system.description.value",
  },
  {
    args: [undefined, "<p>Переклад</p>", babelePayloadDoc, { showOriginal: true }],
    note: "resolves original from flags.babele.originalPayload.description",
  },
  {
    args: [
      "<p>Original EN</p>",
      "<p>Переклад</p>",
      undefined,
      { showOriginal: true, originalLabel: "Джерело", separator: "<hr/>" },
    ],
    note: "custom originalLabel and separator params",
  },
  {
    args: ["", "<p>Переклад</p>", undefined, { showOriginal: true }],
    note: "blank originalValue and no other source -> details block omitted (no usable original)",
  },
];
const formatTranslatedDescriptionFixture = captureNamed(
  "formatTranslatedDescription",
  utils.formatTranslatedDescription,
  formatTranslatedDescriptionCases,
);

const containsOriginalDetailsCases = [
  { args: ['<details data-pf2e-uk-original="true"><summary>Original</summary>x</details>'], note: "data attribute match" },
  { args: ['<details data-babele-original="true"><summary>Original</summary>x</details>'], note: "legacy babele data attribute match" },
  { args: ["<details><summary>Original</summary>x</details>"], note: "label match, no data attribute (EN)" },
  { args: ["<details><summary>Оригінал</summary>x</details>"], note: "label match, no data attribute (UA)" },
  { args: ["<details><summary>Оригинал</summary>x</details>"], note: "label match, no data attribute (RU)" },
  { args: ["<details><summary>Something else</summary>x</details>"], note: "unrelated summary label -> false" },
  { args: ["<p>No details block at all.</p>"], note: "no details element -> false" },
  { args: [null], note: "non-string input -> false" },
];
const containsOriginalDetailsFixture = captureNamed(
  "containsOriginalDetails",
  utils.containsOriginalDetails,
  containsOriginalDetailsCases,
);

const extractOriginalFromExistingDetailsCases = [
  {
    args: ['<p>Переклад</p><details data-pf2e-uk-original="true"><summary>Original</summary><p>The original text.</p></details>'],
    note: "data-attribute-tagged details, regex fallback branch (no `document` global under Node)",
  },
  {
    args: ["<p>Переклад</p><details><summary>Original</summary><p>Untagged original.</p></details>"],
    note: "label-only match (no data attribute), regex fallback branch",
  },
  { args: ["<p>No details here.</p>"], note: "no <details> present -> empty string" },
  { args: [null], note: "non-string input -> empty string" },
];
const extractOriginalFromExistingDetailsFixture = captureNamed(
  "extractOriginalFromExistingDetails",
  utils.extractOriginalFromExistingDetails,
  extractOriginalFromExistingDetailsCases,
);

const resolveOriginalDescriptionCases = [
  {
    args: ["<p>Current value fallback.</p>", undefined, {}, undefined],
    note: "no params.original, no source, no existing details -> falls back to currentValue",
  },
  {
    args: ["<p>Current value.</p>", originalDoc, {}, undefined],
    note: "resolves from document source over currentValue",
  },
  {
    args: [
      "<p>Current value.</p>",
      undefined,
      { original: "<p>Explicit param original.</p>" },
      undefined,
    ],
    note: "explicit params.original takes precedence",
  },
];
const resolveOriginalDescriptionFixture = captureNamed(
  "resolveOriginalDescription",
  utils.resolveOriginalDescription,
  resolveOriginalDescriptionCases,
);

const formatTranslatedNameCases = [
  { args: ["Longsword", undefined], note: "blank translation -> original" },
  { args: ["Longsword", "Довгий меч", { showOriginal: false }], note: "showOriginal false -> translated only" },
  { args: ["Longsword", "Довгий меч", { showOriginal: true }], note: "showOriginal true -> combined" },
  { args: ["Longsword", "Longsword", { showOriginal: true }], note: "translation equals original -> not duplicated" },
];
const formatTranslatedNameFixture = captureNamed("formatTranslatedName", utils.formatTranslatedName, formatTranslatedNameCases);

writeFixture("html-original-details.json", {
  formatTranslatedDescription: formatTranslatedDescriptionFixture,
  containsOriginalDetails: containsOriginalDetailsFixture,
  extractOriginalFromExistingDetails: extractOriginalFromExistingDetailsFixture,
  resolveOriginalDescription: resolveOriginalDescriptionFixture,
  formatTranslatedName: formatTranslatedNameFixture,
});

// ---------------------------------------------------------------------------------------
// 3. Deep merge / get / set edges (null, undefined, nested, array)
// ---------------------------------------------------------------------------------------

const mergeDataCases = [
  { args: [{ a: 1, b: 2 }, { b: 9 }], note: "shallow merge over matching keys" },
  { args: [{ a: 1 }, undefined], note: "nil translation -> returns data untouched" },
  { args: [undefined, { a: 1 }], note: "nil data -> returns translation" },
  { args: [{ flag: true }, { flag: false }], note: "falsy-but-present translation (false) replaces data" },
  { args: [{ flag: true }, { flag: null }], note: "nil (null) translation leaf -> data preserved" },
  { args: [{ count: 5 }, { count: 0 }], note: "falsy-but-present translation (0) replaces data" },
  { args: [{ label: "x" }, { label: "" }], note: "falsy-but-present translation (\"\") replaces data" },
  { args: [[1, 2, 3], [9, null, undefined]], note: "array by index; nil translation entries keep data" },
  { args: [[1, 2], [9, 8, 7]], note: "translation array longer than data -> truncated to data length" },
  { args: [[1, 2, 3], { 0: 9 }], note: "translation is object, not array -> whole array returned unchanged" },
  { args: [{ a: { b: 1, c: 2 } }, { a: { b: 9 } }], note: "nested object merge, only provided leaf replaced" },
  { args: [{ a: [1, 2] }, { a: { 0: 99 } }], note: "nested array leaf with object-shaped translation -> array unchanged" },
];
const mergeDataFixture = captureNamed("mergeData", utils.mergeData, mergeDataCases);

const mergePatchCases = [
  { args: [{ a: 1, b: { c: 2 } }, { b: { c: 3, d: 4 } }], note: "deep merge, patch key added" },
  { args: [{ a: 1 }, undefined], note: "nil patch -> base returned untouched" },
  { args: [null, { x: 1 }], note: "non-object base -> patch fully replaces (base discarded)" },
  { args: [5, { x: 1 }], note: "primitive base -> patch fully replaces" },
  { args: [{ a: 1 }, 5], note: "primitive patch -> patch value returned as-is" },
  { args: [{}, {}], note: "both empty -> empty object" },
];
const mergePatchFixture = captureNamed("mergePatch", utils.mergePatch, mergePatchCases);

const deepGetCases = [
  { args: [{ a: { b: { c: 42 } } }, "a.b.c"], note: "nested path hit" },
  { args: [{ a: 1 }, "a.b.c"], note: "path walks through a non-object -> undefined -> default fallback" },
  { args: [{ a: 1 }, "a.b.c", "fallback!"], note: "missing path with explicit fallback" },
  { args: [null, "a.b", "fb"], note: "null root object -> fallback" },
  { args: [{ a: 1 }, ""], note: "empty path -> returns the object itself" },
  { args: [null, "", "fb"], note: "empty path with null root -> fallback" },
  { args: [{ list: [10, 20, 30] }, "list.1"], note: "dot-path CAN read array elements" },
  { args: [{ flag: false }, "flag", "default"], note: "falsy-but-present leaf (false) is returned, not the fallback" },
  { args: [{ count: 0 }, "count", "default"], note: "falsy-but-present leaf (0) is returned, not the fallback" },
];
const deepGetFixture = captureNamed("deepGet", utils.deepGet, deepGetCases);

const deepSetCases = [
  { args: [{}, "a.b.c", 1], note: "creates intermediate objects" },
  { args: [{ a: { b: 5 } }, "a.b.c", 1], note: "overwrites a primitive intermediate with an object, losing the old value 5" },
  { args: [{}, "", "unused"], note: "empty path -> no-op, target returned unchanged" },
  { args: [{}, "a..b", 1], note: "empty path segments are silently dropped (a..b behaves like a.b)" },
  { args: [{}, "items.0.name", "X"], note: "numeric-looking path segment creates a plain object key \"0\", NOT a real array" },
];
const deepSetFixture = captureNamed("deepSet", utils.deepSet, deepSetCases);

const mergeFoundryObjectCases = [
  {
    args: [{ a: 1, b: { c: 2 } }, { b: { c: 9, d: 8 } }],
    note: "no `foundry.utils.mergeObject` global under Node -> falls back to mergePatch semantics",
  },
  { args: [undefined, { x: 1 }], note: "nil base -> {} ?? patch fallback path" },
  { args: [null, null], note: "both nil -> {}" },
];
const mergeFoundryObjectFixture = captureNamed("mergeFoundryObject", utils.mergeFoundryObject, mergeFoundryObjectCases);

const cloneCases = [
  { args: [{ a: [1, { b: 2 }], c: "text" }], note: "no `foundry.utils.deepClone` global -> falls back to structuredClone" },
  { args: [null], note: "clone of null" },
  { args: [[1, 2, 3]], note: "clone of a top-level array" },
];
const cloneFixture = captureNamed("clone", utils.clone, cloneCases);

const isObjectCases = [
  { args: [{}], note: "plain object -> true" },
  { args: [[]], note: "array -> false (arrays explicitly excluded)" },
  { args: [null], note: "null -> false" },
  { args: ["x"], note: "string -> false" },
];
const isObjectFixture = captureNamed("isObject", utils.isObject, isObjectCases);

const isNilCases = [
  { args: [null], note: "null -> true" },
  { args: [], note: "undefined (omitted arg) -> true" },
  { args: [0], note: "falsy but not nil -> false" },
  { args: [""], note: "falsy but not nil -> false" },
];
const isNilFixture = captureNamed("isNil", utils.isNil, isNilCases);

// convertRulesData deep-recursion edge case (belongs to this boundary as much as to
// "embedded-item conversion" - it's the same nil-vs-undefined-leaf asymmetry as above).
const convertRulesDataNilCases = [
  {
    args: [{ a: null, b: undefined, c: "x" }, { a: "A", b: "B", c: "C" }],
    note:
      "data===null short-circuits BEFORE checking translation (leaf a stays null, translation \"A\" ignored); " +
      "data===undefined also short-circuits and additionally gets FILTERED OUT of the result object (key b is absent)",
  },
];
const convertRulesDataNilFixture = captureNamed("convertRulesData", utils.convertRulesData, convertRulesDataNilCases);

writeFixture("deep-merge-get-set.json", {
  mergeData: mergeDataFixture,
  mergePatch: mergePatchFixture,
  deepGet: deepGetFixture,
  deepSet: deepSetFixture,
  mergeFoundryObject: mergeFoundryObjectFixture,
  clone: cloneFixture,
  isObject: isObjectFixture,
  isNil: isNilFixture,
  convertRulesDataNilLeaves: convertRulesDataNilFixture,
});

// ---------------------------------------------------------------------------------------
// 3b. GAP-1 (P2-converters-charter.md, P2.1) - mergeData over a realistic multi-field PF2E
// structured document (system.* block), NOT range/time-shaped. The existing mergeData fixture
// above pins each clause of the byte-identity contract in isolation on tiny objects; this fixture
// exercises all of them TOGETHER on one representative document, so a leaf-allowlist converter
// that copies through a different field set than mergeData does today would visibly diverge here.
// ---------------------------------------------------------------------------------------

const structuredDocumentData = {
  description: { value: "<p>EN description</p>", gm: "GM secret note" },
  level: { value: 3 },
  traits: { value: ["fire", "magical", "evocation"], rarity: "common" },
  requirements: "Requirement text",
  actionType: { value: "action", cost: 2 },
  frequency: { value: "1/day", max: 1 },
  rules: [
    { key: "Note", selector: "AC", text: "EN rule text one" },
    { key: "GrantItem", value: { uuid: "Compendium.pf2e.spells-srd.Item.ABC123", flag: "granted-item" } },
  ],
  immunities: { value: ["fire", "poison"] },
  publication: { title: "Core Rulebook", license: "OGL", remaster: true },
};

const structuredDocumentTranslation = {
  description: { value: "<p>UA опис</p>", gm: "" },
  level: { value: null },
  traits: { value: ["вогонь"], rarity: "звичайна" },
  requirements: null,
  actionType: { cost: 0 },
  // frequency intentionally absent from translation -> whole subtree must copy through untouched
  rules: [
    { text: "UA текст правила один" },
    { value: { flag: "надано-предмет" } },
    { key: "extra-truncated-away-because-data-rules-length-is-2" },
  ],
  immunities: { value: { 0: "вогонь" } },
  publication: { title: "Основна книга правил", remaster: false },
};

const mergeDataStructuredDocumentCases = [
  {
    args: [structuredDocumentData, structuredDocumentTranslation],
    note:
      "realistic multi-field PF2E system.* block (description/level/traits/requirements/actionType/" +
      "frequency/rules/immunities/publication): exercises source key order, leaf replace vs untouched " +
      "copy-through (incl. a whole untranslated subtree - frequency), falsy-but-present preservation " +
      "(\"\" / 0 / false), array truncation to data length (rules: translation longer), array tail " +
      "copy-from-source (traits.value: translation shorter), nil (null) translation leaves keeping data " +
      "(level.value, requirements), object-shaped translation over an array leaf returning it unchanged " +
      "(immunities.value), and a 3-levels-deep nested partial merge (rules[1].value.flag)",
  },
];
const mergeDataStructuredDocumentFixture = captureNamed(
  "mergeData",
  utils.mergeData,
  mergeDataStructuredDocumentCases,
);

writeFixture("merge-data-structured-document.json", mergeDataStructuredDocumentFixture);

// ---------------------------------------------------------------------------------------
// 3c. GAP-3 (P2-converters-charter.md, P2.2) - convertRulesData over a realistic, multi-entry
// system.rules array. The existing convertRulesDataNilLeaves fixture above pins only the
// null-vs-undefined leaf asymmetry on one flat object; this fixture exercises that same
// asymmetry TOGETHER with nested objects, partial translation, @UUID-labeled string leaves
// (both the default strip path and params.stripUuidLabels:false), and a realistic multi-element
// array, all on one representative system.rules-shaped input, before the built-in `structured`
// converter swap touches this zone.
// ---------------------------------------------------------------------------------------

const rulesDataArray = [
  {
    key: "Note",
    selector: "AC",
    text: "See @UUID[Compendium.pf2e.feats-srd.Item.ABC123]{Battle Instinct} for the full rules text.",
    title: "PF2E.NoteTitle",
    outcome: undefined,
  },
  {
    key: "GrantItem",
    value: {
      uuid: "Compendium.pf2e.spells-srd.Item.DEF456",
      flag: "granted-spell",
      label: "@UUID[Compendium.pf2e.spells-srd.Item.DEF456]{Granted Spell}",
    },
    reevaluateOnUpdate: null,
  },
  {
    key: "FlatModifier",
    selector: "perception",
    value: 2,
    label: "Circumstance bonus to Perception",
  },
  {
    key: "Note",
    selector: "will",
    text: "Plain untranslated text with no UUID link at all.",
  },
];

const rulesDataTranslation = [
  {
    text: "Дивіться @UUID[Compendium.pf2e.feats-srd.Item.ABC123]{Battle Instinct} для повного тексту правил.",
    outcome: "should-be-ignored-because-data-key-is-undefined",
  },
  {
    value: { flag: "надано-заклинання" },
    reevaluateOnUpdate: "should-be-ignored-because-data-leaf-is-null",
  },
  {
    label: "Ситуативний бонус до Сприйняття",
  },
  // index 3 intentionally has no translation entry at all - whole object must pass through unchanged.
];

const convertRulesDataStructuredCases = [
  {
    args: [rulesDataArray, rulesDataTranslation],
    note:
      "realistic multi-entry system.rules array: index 0 - a key (outcome) whose data value is " +
      "undefined is FILTERED OUT of the result regardless of what translation provides for it, an " +
      "untranslated @UUID-labeled text leaf passes through stripOriginalUuidLabels (no-op under " +
      "Node), a plain untranslated title string leaf passes through unchanged; index 1 - a null " +
      "leaf (reevaluateOnUpdate) short-circuits BEFORE checking translation and stays null even " +
      "though translation offers a value, a nested object (value) gets a PARTIAL translation (flag " +
      "translated, uuid/label untranslated leaves pass through stripOriginalUuidLabels); index 2 - " +
      "a translated string leaf (label) is fully replaced, untranslated leaves (selector string, " +
      "value number) pass through unchanged; index 3 - entirely untranslated (translation array has " +
      "only 3 entries) -> the whole object recurses and passes through unchanged.",
  },
  {
    args: [
      { key: "Note", text: "@UUID[Compendium.pf2e.feats-srd.Item.ABC123]{Battle Instinct}" },
      undefined,
    ],
    note:
      "default params (stripUuidLabels not === false) -> untranslated string leaf passes through " +
      "stripOriginalUuidLabels (no-op under Node, output unchanged either way; the strip-vs-no-strip " +
      "call itself is what's pinned here)",
  },
  {
    args: [
      { key: "Note", text: "@UUID[Compendium.pf2e.feats-srd.Item.ABC123]{Battle Instinct}" },
      undefined,
      { stripUuidLabels: false },
    ],
    note:
      "params.stripUuidLabels:false -> stripOriginalUuidLabels is skipped entirely for the " +
      "untranslated string leaf (same output as the default-params case above under Node, since the " +
      "strip itself is a no-op here - only the live parseUuid label-drop path would ever differ)",
  },
];
const convertRulesDataStructuredFixture = captureNamed(
  "convertRulesData",
  utils.convertRulesData,
  convertRulesDataStructuredCases,
);

writeFixture("rules-data-structured.json", convertRulesDataStructuredFixture);

// ---------------------------------------------------------------------------------------
// 4. UUID / compendium reference resolution (Node-capturable subset only - see meta.json)
// ---------------------------------------------------------------------------------------

const parseCompendiumUuidCases = [
  { args: ["Compendium.pf2e.equipment-srd.Item.abc123XYZ"], note: "well-formed compendium UUID" },
  { args: ["Compendium.pf2e-uk.spells-srd.Item.AAAA1111"], note: "well-formed, this module's own pack id" },
  { args: ["Compendium.pf2e.Item.abc123"], note: "malformed - missing pack segment -> null" },
  { args: ["NotCompendium.pf2e.equipment-srd.Item.abc123"], note: "wrong prefix -> null" },
  { args: [""], note: "empty string -> null" },
  { args: [null], note: "null ref -> null (regex runs against \"\")" },
  { args: [undefined], note: "undefined ref (omitted) -> null" },
];
const parseCompendiumUuidFixture = captureNamed("parseCompendiumUuid", utils.parseCompendiumUuid, parseCompendiumUuidCases);

const getCompendiumSourceRefCases = [
  { args: [{ _stats: { compendiumSource: "Compendium.pf2e.spells-srd.Item.ABC" } }], note: "_stats.compendiumSource wins" },
  { args: [{ flags: { pf2e: { compendiumSource: "Compendium.pf2e.equipment-srd.Item.DEF" } } }], note: "flags.pf2e.compendiumSource, no _stats" },
  { args: [{ flags: { core: { sourceId: "Compendium.pf2e.actions.Item.GHI" } } }], note: "flags.core.sourceId, last fallback" },
  {
    args: [{
      _stats: { compendiumSource: null },
      flags: { pf2e: { compendiumSource: "Compendium.pf2e.equipment-srd.Item.DEF" } },
    }],
    note: "explicit null _stats value is skipped (??), falls through to flags.pf2e",
  },
  { args: [{}], note: "no source anywhere -> null" },
  { args: [null], note: "null document -> null" },
];
const getCompendiumSourceRefFixture = captureNamed("getCompendiumSourceRef", utils.getCompendiumSourceRef, getCompendiumSourceRefCases);

const stripOriginalUuidLabelsCases = [
  {
    args: ["@UUID[Compendium.pf2e.spells-srd.Item.ABC]{Fireball}"],
    note: "no `foundry.utils.parseUuid` under Node -> safeParseUuid always undefined -> label is NEVER dropped, even when it would match originalName in a live world",
  },
  { args: ["@UUID[Compendium.pf2e.spells-srd.Item.ABC]"], note: "no label present -> unchanged" },
  { args: ["@UUID[Compendium.pf2e.spells-srd.Item.ABC#Section]{Fireball}"], note: "#section suffix preserved" },
  {
    args: ["See @UUID[Compendium.pf2e.spells-srd.Item.ABC]{Fireball} and @UUID[Compendium.pf2e.spells-srd.Item.DEF]{Ray of Frost}."],
    note: "multiple links in one string",
  },
  { args: [null], note: "non-string input -> returned unchanged" },
  { args: [42], note: "non-string input -> returned unchanged" },
];
const stripOriginalUuidLabelsFixture = captureNamed("stripOriginalUuidLabels", utils.stripOriginalUuidLabels, stripOriginalUuidLabelsCases);

const extractAllLocalizeKeysCases = [
  { args: ["@Localize[PF2E.SomeKey]"], note: "single key" },
  { args: ["no localize here"], note: "no match -> []" },
  { args: ["@Localize[A.B] and @Localize[C.D]"], note: "two keys" },
  { args: [null], note: "non-string -> []" },
  { args: [42], note: "non-string -> []" },
];
const extractAllLocalizeKeysFixture = captureNamed("extractAllLocalizeKeys", utils.extractAllLocalizeKeys, extractAllLocalizeKeysCases);

writeFixture("uuid-compendium.json", {
  parseCompendiumUuid: parseCompendiumUuidFixture,
  getCompendiumSourceRef: getCompendiumSourceRefFixture,
  stripOriginalUuidLabels: stripOriginalUuidLabelsFixture,
  extractAllLocalizeKeys: extractAllLocalizeKeysFixture,
});

// ---------------------------------------------------------------------------------------
// 5. Embedded-item and spell-scroll conversion (Node-capturable subset only - see meta.json)
// ---------------------------------------------------------------------------------------

const loreItem = { _id: "item-lore-1", name: "Society Lore", type: "lore", system: { mod: { value: 5 }, proficient: { value: 1 } } };
const loreTranslation = { name: "Знання про Товариство" };

const weaponItem = {
  _id: "item-weapon-1",
  name: "Longsword",
  type: "weapon",
  system: {
    description: { value: "<p>A blade of versatile design.</p>", gm: "" },
    rules: [],
    range: { value: null },
    slug: null,
  },
};
const weaponTranslation = { name: "Довгий меч", description: "<p>Клинок універсального дизайну.</p>" };

const scrollItem = {
  _id: "item-scroll-1",
  name: "Scroll of Fireball",
  type: "consumable",
  system: {
    category: "scroll",
    description: { value: "<p>A scroll.</p>", gm: "" },
    spell: { name: "Fireball", uuid: null },
  },
};
const scrollTranslation = { name: "Сувій Вогняної кулі", description: "<p>Сувій.</p>" };

const untranslatedWeaponItem = {
  _id: "item-weapon-2",
  name: "Dagger",
  type: "weapon",
  system: { description: { value: "<p>A small blade.</p>", gm: "" }, rules: [], range: { value: null }, slug: null },
};

const convertActorEmbeddedItemCases = [
  { args: [loreItem, loreTranslation, undefined, {}], note: "type=lore, direct-translation path" },
  { args: [weaponItem, weaponTranslation, undefined, {}], note: "type=weapon, no compendium match under Node -> direct-translation fallback" },
  {
    args: [scrollItem, scrollTranslation, undefined, {}],
    note:
      "type=consumable/category=scroll: under Node, findIndexByName/findIndexByUuid always miss (no game.packs), " +
      "so the spell-scroll-specific branch in convertEmbeddedSpellConsumable never fires and this degrades to the same " +
      "direct-translation fallback as a plain item - the real scroll+spell-translation branch is live-verification-only",
  },
  { args: [untranslatedWeaponItem, undefined, undefined, {}], note: "no translation entry at all -> name/description stay original" },
];
const convertActorEmbeddedItemFixture = captureNamed("convertActorEmbeddedItem", utils.convertActorEmbeddedItem, convertActorEmbeddedItemCases);

const convertActorEmbeddedItemsCases = [
  {
    args: [
      [loreItem, weaponItem, untranslatedWeaponItem],
      { "item-lore-1": loreTranslation, "item-weapon-1": weaponTranslation },
      undefined,
      {},
    ],
    note: "translation as a plain object map keyed by _id",
  },
  {
    args: [
      [loreItem, weaponItem],
      [{ _id: "item-lore-1", name: "Знання про Товариство" }, { _id: "item-weapon-1", name: "Довгий меч", description: "<p>Клинок.</p>" }],
      undefined,
      {},
    ],
    note: "translation as an array of entries (exercises buildTranslationIndex)",
  },
];
const convertActorEmbeddedItemsFixture = captureNamed("convertActorEmbeddedItems", utils.convertActorEmbeddedItems, convertActorEmbeddedItemsCases);

const sluggifyItemNameCases = [
  { args: [{ system: { slug: "existing-slug" }, name: "Long Sword" }], note: "existing system.slug wins over name" },
  { args: [{ name: "Long Sword +1" }], note: "no game.pf2e.sluggify under Node -> regex fallback" },
  { args: [{ name: "Довгий меч" }], note: "Cyrillic name: PB.1 fix - fallback now mirrors PF2E sluggify (Unicode-aware), so it produces a real slug instead of an empty string" },
  { args: [{}], note: "no name at all -> empty slug" },
  { args: [null], note: "null item -> empty slug" },
];
const sluggifyItemNameFixture = captureNamed("sluggifyItemName", utils.sluggifyItemName, sluggifyItemNameCases);

const ensureItemSlugCases = [
  { args: [{ name: "Sword" }, "sword"], note: "sets system.slug on a clone" },
  { args: [{ name: "Sword" }, ""], note: "falsy slug -> item returned unchanged, no system key added" },
  { args: [{ name: "Sword" }, null], note: "null slug -> item returned unchanged" },
];
const ensureItemSlugFixture = captureNamed("ensureItemSlug", utils.ensureItemSlug, ensureItemSlugCases);

const buildTextPatchCases = [
  {
    args: [
      { name: "Old Name", system: { description: { value: "Old desc" } } },
      { name: "New Name", system: { description: { value: "New desc" } } },
    ],
    note: "name + description both differ -> full patch",
  },
  {
    args: [
      { name: "Same", system: { description: { value: "Same desc" } } },
      { name: "Same", system: { description: { value: "Same desc" } } },
    ],
    note: "nothing differs -> null",
  },
  {
    args: [
      { name: "Old Name", system: { description: { value: "Old desc" } } },
      { name: "New Name", system: { description: { value: "New desc" } } },
      { updateName: false },
    ],
    note: "updateName:false -> name omitted from patch even though it differs",
  },
  {
    args: [
      { name: "X", system: { description: { value: "d", gm: "old gm" } } },
      { name: "X", system: { description: { value: "d", gm: "new gm" } } },
      { updateGmDescription: true },
    ],
    note: "updateGmDescription:true -> gm diff included",
  },
];
const buildTextPatchFixture = captureNamed("buildTextPatch", utils.buildTextPatch, buildTextPatchCases);

const journalPages = [
  { name: "Page One", _id: "p1", text: { content: "Hello" } },
  { name: "Page Two", _id: "p2", text: { content: "World" } },
];
const convertJournalPagesCases = [
  {
    args: [
      journalPages,
      { "Page One": { name: "Сторінка Один", text: { content: "Привіт" } }, p2: { name: "Сторінка Два", content: "Світ" } },
      {},
    ],
    note: "translation keyed by name for page one, by _id for page two; content field via .text.content and via .content fallback",
  },
  { args: [journalPages, undefined, {}], note: "no translation -> data returned unchanged" },
  { args: [null, { p1: { name: "x" } }, {}], note: "data not an array -> returned unchanged" },
  {
    args: [journalPages, { "Page One": null }, {}],
    note: "translation entry present but falsy (null) -> that page returned unchanged",
  },
];
const convertJournalPagesFixture = captureNamed("convertJournalPages", utils.convertJournalPages, convertJournalPagesCases);

writeFixture("embedded-items.json", {
  convertActorEmbeddedItem: convertActorEmbeddedItemFixture,
  convertActorEmbeddedItems: convertActorEmbeddedItemsFixture,
  sluggifyItemName: sluggifyItemNameFixture,
  ensureItemSlug: ensureItemSlugFixture,
  buildTextPatch: buildTextPatchFixture,
  convertJournalPages: convertJournalPagesFixture,
});

// ---------------------------------------------------------------------------------------
// 6. Embedded spell-scroll conversion, called directly (still Node-fallback only - see meta.json)
// ---------------------------------------------------------------------------------------

const convertEmbeddedSpellConsumableCases = [
  {
    args: [scrollItem, scrollTranslation, {}],
    note:
      "under Node, findIndexByUuid(scrollUuid) always misses (no game.packs), so findBabeleEntry never finds a mapping/entry " +
      "and this function returns undefined regardless of input - the real found-translation branch is live-verification-only",
  },
];
const convertEmbeddedSpellConsumableFixture = captureNamed(
  "convertEmbeddedSpellConsumable",
  utils.convertEmbeddedSpellConsumable,
  convertEmbeddedSpellConsumableCases,
);

writeFixture("embedded-spell-scroll.json", {
  convertEmbeddedSpellConsumable: convertEmbeddedSpellConsumableFixture,
});

// ---------------------------------------------------------------------------------------
// meta.json - capture metadata, documented stubs (none), and the live-verification-only list
// ---------------------------------------------------------------------------------------

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: join(__dirname, ".."), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const meta = {
  purpose: "ROADMAP P1.1 characterization fixtures for scripts/utils.js, captured by running the real code.",
  source: "scripts/utils.js",
  capturedByScript: "tests/capture-fixtures.mjs",
  nodeVersion: process.version,
  gitHeadAtCapture: gitHead(),
  stubbedGlobals: [],
  stubbedGlobalsNote:
    "scripts/utils.js imports and every captured function here runs cleanly under plain Node with " +
    "NO Foundry global (`game`, `foundry`, `document`, `ui`, `Hooks`, `Babele`) present at all - verified. " +
    "No stub was installed. Functions that branch on one of these globals take their real, already-coded " +
    "'absent' fallback branch under Node; that fallback IS what got captured. The alternate 'global present' " +
    "branch is real Foundry/Babele runtime behavior and is NOT captured here (see liveVerificationOnly) - " +
    "faking those globals would mean inventing Foundry/Babele's own behavior, which this project's rules forbid.",
  undefinedSentinel: UNDEFINED_SENTINEL,
  undefinedSentinelNote:
    "JSON has no `undefined`. Any captured `output` (or nested value inside it) that is a real JS `undefined` " +
    "is written as the literal string \"" + UNDEFINED_SENTINEL + "\" instead of being silently dropped, because " +
    "for at least one seam (convertRulesData) the distinction between an explicit undefined-valued key and an " +
    "absent key is itself part of the pinned behavior.",
  liveVerificationOnly: [
    "safeParseUuid - wraps foundry.utils.parseUuid, absent under Node -> always undefined; real parsing needs live Foundry",
    "findIndexByUuid / findIndexByUUID - needs a real game.packs compendium collection + index",
    "findIndexByName - needs a real game.packs collection to iterate",
    "getCompendiumDataFromUUID - needs safeParseUuid + a real compendium collection/index",
    "mappedCompendiumFor / translatedCompendiumFor - needs game.babele",
    "findBabeleEntry - needs a real Babele translated/mapped compendium + mapping",
    "mapWithBabeleMapping - needs a real Babele mapping object with a working .map()",
    "getFallbackLocalizeText - wraps foundry.utils.getProperty(game.i18n._fallback, key), both absent under Node",
    "registerPf2eBabeleHelpers / registerIdentityExtractorSafe / registerTranslationMatchStrategySafe - needs a real game.babele instance",
    "getModuleSetting / debugLog - needs game.settings; under Node always returns the caller's fallback (no branch to pin beyond that)",
    "extractOriginalFromExistingDetails DOM branch - needs a real `document` (Foundry/Electron); only the regex fallback branch is captured",
    "mergeFoundryObject / clone Foundry-global-present branch - needs real foundry.utils.mergeObject / foundry.utils.deepClone",
    "convertItemFromCompendium (internal) and the found-translation branch of convertItemFromCompendium/convertEmbeddedSpellConsumable - needs a real compendium + Babele mapping to ever return a non-undefined result",
    "notifyItemConversionError - needs globalThis.ui.notifications (Foundry UI); the catch-path that calls it is not exercised by these fixtures (see report re: a possible double-throw bug in this function)",
  ],
};

writeFixture("meta.json", meta);

console.log("Fixtures written to", FIXTURES_DIR);
