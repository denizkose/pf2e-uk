import { MODULE_ID } from "../constants.js";
import { getModuleSetting, settingsKeys } from "../settings.js";
import { deepGet, deepSet, mergeFoundryObject, isBlankTranslation } from "../utils/object-utils.js";
import {
  formatTranslatedName,
  formatTranslatedDescription,
  containsOriginalDetails,
} from "./original-details.js";
import { getCompendiumSourceRef, extractAllLocalizeKeys, withoutIdFields } from "../utils/compendium-refs.js";
import {
  findIndexByUuid,
  findIndexByName,
  getCompendiumDataFromUUID,
  findBabeleEntry,
  mapWithBabeleMapping,
  getFallbackLocalizeText,
} from "../utils/compendium-lookup.js";
import { translateSystemRangeAndTime } from "./range-time.js";
import { convertRulesData } from "./document-converters.js";
import { sluggifyItemName, ensureItemSlug } from "../utils/item-slug.js";
import { logError } from "../utils/log.js";

export { sluggifyItemName, ensureItemSlug };

const EMBEDDED_SPELL_CONSUMABLE_CATEGORIES = new Set(["scroll", "spell-gem", "wand"]);
const DEFAULT_ITEM_CONVERSION_ERROR =
  "Item translation failed (could not build a detailed error message)";

export function buildTextPatch(embedded, source, options = {}) {
  const patch = {};
  const {
    updateName = true,
    updateDescription = true,
    updateGmDescription = false,
  } = options;

  if (updateName && source?.name && embedded?.name !== source.name) {
    patch.name = source.name;
  }

  if (updateDescription) {
    const sourceDescription = deepGet(source, "system.description.value");
    const currentDescription = deepGet(embedded, "system.description.value");

    if (typeof sourceDescription === "string" && sourceDescription !== currentDescription) {
      deepSet(patch, "system.description.value", sourceDescription);
    }
  }

  if (updateGmDescription) {
    const sourceDescription = deepGet(source, "system.description.gm");
    const currentDescription = deepGet(embedded, "system.description.gm");

    if (typeof sourceDescription === "string" && sourceDescription !== currentDescription) {
      deepSet(patch, "system.description.gm", sourceDescription);
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function buildTranslationIndex(translation) {
  if (!Array.isArray(translation)) return null;

  const map = new Map();
  for (const entry of translation) {
    for (const key of [entry?._id, entry?.id, entry?.name]) {
      if (key && !map.has(key)) map.set(key, entry);
    }
  }
  return map;
}

function getItemTranslation(translation, translationById, item) {
  if (!translation) return undefined;
  if (translationById) {
    return (
      translationById.get(item?._id) ??
      translationById.get(item?.id) ??
      translationById.get(item?.name)
    );
  }
  return (
    translation[item?._id] ??
    translation[item?.id] ??
    translation[item?.name]
  );
}

export function convertActorEmbeddedItems(data, translation, actor, context = {}) {
  if (!Array.isArray(data)) return data;

  const translationById = buildTranslationIndex(translation);
  return data.map((item) =>
    convertActorEmbeddedItem(
      item,
      getItemTranslation(translation, translationById, item),
      actor,
      context,
    ),
  );
}

export function convertActorEmbeddedItem(item, translation, actor, context = {}) {
  try {
    const slug = sluggifyItemName(item);

    if (isEmbeddedSpellConsumable(item)) {
      const converted = convertEmbeddedSpellConsumable(item, translation, context);
      if (converted) return ensureItemSlug(converted, slug);
    }

    if (item?.type === "lore") {
      return mergeFoundryObject(item, {
        name: formatTranslatedName(item.name, translation?.name, context.params),
        system: { slug },
      });
    }

    const compendiumResult = convertItemFromCompendium(item, translation, slug, context);
    if (compendiumResult) return compendiumResult;

    return convertItemFromDirectTranslation(item, translation, slug, context);
  } catch (error) {
    notifyItemConversionError(item, actor, error);
    return item;
  }
}

function isEmbeddedSpellConsumable(item) {
  return (
    item?.type === "consumable" &&
    EMBEDDED_SPELL_CONSUMABLE_CATEGORIES.has(item?.system?.category)
  );
}

function getTranslationDescription(translation) {
  return (
    translation?.description ??
    translation?.system?.description?.value ??
    translation?.system?.description ??
    undefined
  );
}

function getTranslationGmDescription(translation) {
  return translation?.gm ?? translation?.system?.description?.gm ?? undefined;
}

function mergeEntryWithTranslation(entry, translation) {
  return mergeFoundryObject(entry, withoutIdFields(translation));
}

function convertItemFromCompendium(item, translation, slug, context = {}) {
  const uuid = getCompendiumSourceRef(item);
  const compendiumData = getCompendiumDataFromUUID(uuid);
  if (!compendiumData) return undefined;

  const babeleData = findBabeleEntry(compendiumData.index, item?.name, context);
  if (!babeleData?.mapping || !babeleData?.entry) return undefined;

  const effectiveTranslation = mergeEntryWithTranslation(babeleData.entry, translation);

  const mapped = mapWithBabeleMapping(babeleData.mapping, item, effectiveTranslation, context);
  if (!mapped) return undefined;

  const result = mergeFoundryObject(
    item,
    mergeFoundryObject(mapped, {
      name: formatTranslatedName(item.name, effectiveTranslation.name, context.params),
      system: { slug },
    }),
  );

  applyOriginalDetailsEnrichment(result, item, context);
  appendFallbackLocalizeOriginals(result, effectiveTranslation.description, context);
  return translateSystemRangeAndTime(result);
}

function convertItemFromDirectTranslation(item, translation, slug, context = {}) {
  const sourceDescription = deepGet(item, "system.description.value");
  const sourceGmDescription = deepGet(item, "system.description.gm");

  return translateSystemRangeAndTime(mergeFoundryObject(item, {
    name: formatTranslatedName(item?.name, translation?.name, context.params),
    system: {
      description: {
        value: formatTranslatedDescription(
          sourceDescription,
          getTranslationDescription(translation),
          item,
          { ...context.params, originalPath: "system.description.value" },
        ),
        gm: formatTranslatedDescription(
          sourceGmDescription,
          getTranslationGmDescription(translation),
          item,
          { ...context.params, originalPath: "system.description.gm" },
        ),
      },
      rules: convertRulesData(deepGet(item, "system.rules"), translation?.rules, context.params),
      slug,
    },
  }));
}

function ensureOriginalDetailsForItemField(result, originalItem, path, context = {}) {
  const translatedDescription = deepGet(result, path);
  const originalDescription = deepGet(originalItem, path);

  if (typeof translatedDescription !== "string" || isBlankTranslation(translatedDescription)) return;
  if (containsOriginalDetails(translatedDescription)) return;

  const withOriginal = formatTranslatedDescription(
    originalDescription,
    translatedDescription,
    originalItem,
    { ...context.params, originalPath: path },
  );

  if (withOriginal !== translatedDescription) {
    deepSet(result, path, withOriginal);
  }
}

function applyOriginalDetailsEnrichment(result, item, context = {}) {
  ensureOriginalDetailsForItemField(result, item, "system.description.value", context);
  ensureOriginalDetailsForItemField(result, item, "system.description.gm", context);
}

export function convertEmbeddedSpellConsumable(data, translation = undefined, context = {}) {
  const scrollUuid = getCompendiumSourceRef(data);
  const spell = data?.system?.spell;
  const spellUuid = getCompendiumSourceRef(spell) ?? findIndexByName(spell?.name)?.uuid;

  const itemTranslation = findBabeleEntry(findIndexByUuid(scrollUuid), data?.name, context);
  if (!itemTranslation?.mapping || !itemTranslation?.entry) return undefined;

  const scrollDescription = data?.system?.description?.value ?? "";
  const spellLink = spellUuid ?? scrollDescription.match(/@UUID\[([^\]]+)]/)?.[1];
  const effectiveTranslation = mergeEntryWithTranslation(itemTranslation.entry, translation);

  if (!effectiveTranslation.description && spellLink && itemTranslation.entry.description) {
    effectiveTranslation.description = `<p>@UUID[${spellLink}]</p><hr>${itemTranslation.entry.description}`;
  }

  const mappedItem = mapWithBabeleMapping(itemTranslation.mapping, data, effectiveTranslation, context);
  const result = mergeFoundryObject(data, mappedItem);
  applyOriginalDetailsEnrichment(result, data, context);

  if (spell && spellUuid) {
    const spellTranslation = findBabeleEntry(findIndexByUuid(spellUuid), spell.name, context);
    if (spellTranslation?.mapping && spellTranslation?.entry) {
      result.system ??= {};
      result.system.spell = translateSystemRangeAndTime(mergeFoundryObject(
        spell,
        mapWithBabeleMapping(spellTranslation.mapping, spell, spellTranslation.entry, context),
      ));
    }
  }

  return translateSystemRangeAndTime(result);
}

function appendFallbackLocalizeOriginals(result, translatedDescription, context = {}) {
  const shouldShowLocalizeOriginals = context.params?.showLocalizeOriginals ?? getModuleSetting(
    settingsKeys.BABELE_SHOW_LOCALIZE_ORIGINALS,
    true,
  );
  if (!shouldShowLocalizeOriginals) return;

  const localizeKeys = extractAllLocalizeKeys(translatedDescription);
  if (!localizeKeys.length) return;

  const originals = localizeKeys
    .map((key) => getFallbackLocalizeText(key))
    .filter((value) => typeof value === "string" && value.length > 0);

  if (!originals.length) return;

  const currentDescription = deepGet(result, "system.description.value");
  if (typeof currentDescription !== "string") return;

  deepSet(
    result,
    "system.description.value",
    formatTranslatedDescription(originals.join("\n"), currentDescription, result, context.params),
  );
}

function notifyItemConversionError(item, actor, error) {
  let message;
  try {
    const i18n = globalThis.game?.i18n;
    if (typeof i18n?.format === "function") {
      const moduleVersion = globalThis.game?.modules?.get?.(MODULE_ID)?.version ?? "unknown";
      const actorClause = actor
        ? i18n.format("PF2E-UK.ItemConversionErrorActor", {
            actorName: actor.name,
            actorId: actor._id ?? actor.id ?? "no-id",
          })
        : "";
      message = i18n.format("PF2E-UK.ItemConversionError", {
        itemName: item?.name ?? "<unnamed>",
        itemId: item?._id ?? item?.id ?? "no-id",
        actorClause,
        foundryVersion: globalThis.game?.version ?? "unknown",
        systemId: globalThis.game?.system?.id ?? "unknown",
        systemVersion: globalThis.game?.system?.version ?? "unknown",
        moduleVersion,
      });
    } else {
      message = DEFAULT_ITEM_CONVERSION_ERROR;
    }
  } catch {
    message = DEFAULT_ITEM_CONVERSION_ERROR;
  }

  try {
    globalThis.ui?.notifications?.error?.(message);
    logError(message, error);
  } catch {
  }
}
