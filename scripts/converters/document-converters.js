import { clone, deepGet, deepSet, isNil } from "../utils/object-utils.js";
import { formatTranslatedName, formatTranslatedDescription } from "./original-details.js";
import { stripOriginalUuidLabels } from "../utils/compendium-lookup.js";

export function convertRulesData(data, translation, params = {}) {
  if (isNil(data)) return data;

  if (typeof data !== "object") {
    if (!isNil(translation)) return translation;
    return typeof data === "string" && params.stripUuidLabels !== false
      ? stripOriginalUuidLabels(data)
      : data;
  }

  if (Array.isArray(data)) {
    return data
      .map((entry, index) => convertRulesData(entry, translation?.[index], params))
      .filter((entry) => entry !== undefined);
  }

  const result = {};
  for (const key of Object.keys(data)) {
    const value = convertRulesData(data[key], translation?.[key], params);
    if (value !== undefined) result[key] = value;
  }

  return result;
}

export function convertJournalPages(data, translation, context = {}) {
  if (!translation || !Array.isArray(data)) return data;

  return data.map((page) => {
    const pageTranslation =
      translation[page.name] ?? translation[page._id] ?? translation[page.id];
    if (!pageTranslation) return page;

    const result = clone(page);
    result.name = formatTranslatedName(page.name, pageTranslation.name, context.params);

    const translatedText =
      pageTranslation?.text?.content ??
      pageTranslation?.text ??
      pageTranslation?.content;
    const originalContent = deepGet(page, "text.content");

    if (translatedText !== undefined && originalContent !== undefined) {
      deepSet(
        result,
        "text.content",
        formatTranslatedDescription(originalContent, translatedText, page, context.params),
      );
    }

    return result;
  });
}
