import { capitalizeFirst, mergeData } from "../utils/object-utils.js";
import { translateRangeValue, translateTimeValue, translateSystemRangeAndTime } from "./range-time.js";
import { formatTranslatedName, formatTranslatedDescription } from "./original-details.js";
import { convertRulesData, convertJournalPages } from "./document-converters.js";
import { convertActorEmbeddedItems } from "./embedded-items.js";

export function defaultMerge(value, translation) {
  return translateSystemRangeAndTime(mergeData(value, translation));
}

export function range(value, translation) {
  return translateRangeValue(translation ?? value);
}

export function time(value, translation) {
  return translateTimeValue(translation ?? value);
}

export function duration(value, translation) {
  return translateTimeValue(translation ?? value);
}

export function name(value, translation, _data, _tc, _allTranslations, _runtime = {}, params = {}) {
  return formatTranslatedName(value, translation, params);
}

export function description(value, translation, data, _tc, _allTranslations, _runtime = {}, params = {}) {
  return formatTranslatedDescription(value, translation, data, params);
}

export function prerequisites(value, translation, _data, _tc, _allTranslations, _runtime = {}, params = {}) {
  if (!Array.isArray(value)) return value;

  const merged = mergeData(value, translation);
  const result = merged.map((entry) => ({
    ...entry,
    value: capitalizeFirst(entry?.value),
  }));

  return result;
}

export function rules(value, translation, _data, _tc, _allTranslations, _runtime = {}, params = {}) {
  return convertRulesData(value, translation, params);
}

export function journal(value, translation, data, tc, allTranslations, runtime = {}, params = {}) {
  return convertJournalPages(value, translation, { data, tc, allTranslations, runtime, params });
}

export function items(value, translation, actor, tc, allTranslations, runtime = {}, params = {}) {
  return convertActorEmbeddedItems(value, translation, actor, {
    tc,
    allTranslations,
    runtime,
    params,
  });
}
