import { isObject, clone, deepGet, deepSet } from "../utils/object-utils.js";

function ukrainianPlural(numberText, forms) {
  const normalized = String(numberText ?? "").replace(",", ".");
  const number = Number(normalized);

  if (!Number.isFinite(number) || !Number.isInteger(number)) return forms.many;

  const absolute = Math.abs(number);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return forms.many;
  if (last === 1) return forms.one;
  if (last >= 2 && last <= 4) return forms.few;
  return forms.many;
}

function ukrainianGenitivePlural(numberText, forms) {
  const normalized = String(numberText ?? "").replace(",", ".");
  const number = Number(normalized);

  if (!Number.isFinite(number) || !Number.isInteger(number)) return forms.genitiveMany;

  const absolute = Math.abs(number);
  if (absolute === 1) return forms.genitiveOne;
  return forms.genitiveMany;
}

function createUnitEntry(unitPattern, forms) {
  return {
    numberedRe: new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(?:${unitPattern})\\b`, "gi"),
    upToRe: new RegExp(`\\bup\\s+to\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:${unitPattern})\\b`, "gi"),
    forms,
  };
}

const FEET_UNIT = createUnitEntry("feet|feets|foot|ft\\.?", {
  one: "фут",
  few: "фути",
  many: "футів",
  genitiveOne: "фута",
  genitiveMany: "футів",
});

const MILES_UNIT = createUnitEntry("miles?|mi\\.?", {
  one: "миля",
  few: "милі",
  many: "миль",
  genitiveOne: "милі",
  genitiveMany: "миль",
});

const ACTIONS_UNIT = createUnitEntry("actions?", {
  one: "дія",
  few: "дії",
  many: "дій",
  genitiveOne: "дії",
  genitiveMany: "дій",
});

const ROUNDS_UNIT = createUnitEntry("rounds?", {
  one: "раунд",
  few: "раунди",
  many: "раундів",
  genitiveOne: "раунду",
  genitiveMany: "раундів",
});

const MINUTES_UNIT = createUnitEntry("minutes?|mins?|min\\.?", {
  one: "хвилина",
  few: "хвилини",
  many: "хвилин",
  genitiveOne: "хвилини",
  genitiveMany: "хвилин",
});

const HOURS_UNIT = createUnitEntry("hours?|hrs?|hr\\.?", {
  one: "година",
  few: "години",
  many: "годин",
  genitiveOne: "години",
  genitiveMany: "годин",
});

const DAYS_UNIT = createUnitEntry("days?", {
  one: "день",
  few: "дні",
  many: "днів",
  genitiveOne: "дня",
  genitiveMany: "днів",
});

const RANGE_UNITS = [FEET_UNIT, MILES_UNIT];
const TIME_UNITS = [ACTIONS_UNIT, ROUNDS_UNIT, MINUTES_UNIT, HOURS_UNIT, DAYS_UNIT];

function replaceNumberedUnit(value, unit) {
  return value.replace(
    unit.numberedRe,
    (_match, numberText) => `${numberText} ${ukrainianPlural(numberText, unit.forms)}`,
  );
}

function replaceUpToNumberedUnit(value, unit) {
  return value.replace(
    unit.upToRe,
    (_match, numberText) => `${unit.forms.upTo ?? "до"} ${numberText} ${ukrainianGenitivePlural(numberText, unit.forms)}`,
  );
}

function replaceNumberedUnits(value, unit) {
  return replaceNumberedUnit(replaceUpToNumberedUnit(value, unit), unit);
}

export function translateRangeValue(value) {
  if (typeof value !== "string" || value.length === 0) return value;

  let result = value.trim();

  result = result.replace(/\btouch\b/gi, "доторк");
  for (const unit of RANGE_UNITS) {
    result = replaceNumberedUnits(result, unit);
  }

  result = result.replace(/\b(?:feet|feets|ft\.?)\b/gi, "футів");
  result = result.replace(/\bfoot\b/gi, "фут");
  result = result.replace(/\b(?:miles|mi\.?)\b/gi, "миль");
  result = result.replace(/\bmile\b/gi, "миля");

  return result;
}

export function translateTimeValue(value) {
  if (typeof value !== "string" || value.length === 0) return value;

  let result = value.trim();

  result = result.replace(/\bfree[-\s]+action\b/gi, "вільна дія");
  result = result.replace(/\breaction\b/gi, "реакція");

  for (const unit of TIME_UNITS) {
    result = replaceNumberedUnits(result, unit);
  }

  return result;
}

export function translateSystemRangeAndTime(documentLike) {
  if (!isObject(documentLike)) return documentLike;

  const result = clone(documentLike);
  localizeFieldAtPath(result, "system.range.value", translateRangeValue);
  localizeFieldAtPath(result, "range.value", translateRangeValue);
  localizeFieldAtPath(result, "system.time.value", translateTimeValue);
  localizeFieldAtPath(result, "time.value", translateTimeValue);
  localizeFieldAtPath(result, "system.duration.value", translateTimeValue);
  localizeFieldAtPath(result, "duration.value", translateTimeValue);
  return result;
}

function localizeFieldAtPath(target, path, converter) {
  const currentValue = deepGet(target, path);
  if (typeof currentValue !== "string" || currentValue.length === 0) return;

  const translatedValue = converter(currentValue);
  if (translatedValue !== currentValue) deepSet(target, path, translatedValue);
}
