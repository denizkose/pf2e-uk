import { getModuleSetting } from "./settings.js";
import { logDebug as debugLog } from "./utils/log.js";
import {
  isObject,
  isNil,
  isBlankTranslation,
  mergeData,
  mergePatch,
  deepGet,
  deepSet,
  clone,
  mergeFoundryObject,
  capitalizeFirst,
} from "./utils/object-utils.js";
import {
  translateRangeValue,
  translateTimeValue,
  translateSystemRangeAndTime,
} from "./converters/range-time.js";
import {
  formatTranslatedName,
  formatTranslatedDescription,
  shouldShowOriginalDescription,
  coerceBooleanOption,
  containsOriginalDetails,
  resolveOriginalDescription,
  getOriginalFromDocumentSource,
  getOriginalFromBabelePayload,
  extractOriginalFromExistingDetails,
} from "./converters/original-details.js";
import {
  getCompendiumSourceRef,
  parseCompendiumUuid,
  extractAllLocalizeKeys,
  withoutIdFields,
} from "./utils/compendium-refs.js";
import {
  safeParseUuid,
  findIndexByUuid,
  findIndexByName,
  getCompendiumDataFromUUID,
  getCurrentCompendium,
  mappedCompendiumFor,
  translatedCompendiumFor,
  findBabeleEntry,
  mapWithBabeleMapping,
  getFallbackLocalizeText,
  stripOriginalUuidLabels,
} from "./utils/compendium-lookup.js";
import { registerPf2eBabeleHelpers } from "./babele-registration.js";
import { convertRulesData, convertJournalPages } from "./converters/document-converters.js";
import {
  sluggifyItemName,
  ensureItemSlug,
  buildTextPatch,
  convertActorEmbeddedItems,
  convertActorEmbeddedItem,
  convertEmbeddedSpellConsumable,
} from "./converters/embedded-items.js";

export { getModuleSetting, debugLog };
export { isObject, isNil, isBlankTranslation, mergeData, mergePatch, deepGet, deepSet, clone, mergeFoundryObject, capitalizeFirst };
export { translateRangeValue, translateTimeValue, translateSystemRangeAndTime };
export {
  formatTranslatedName,
  formatTranslatedDescription,
  shouldShowOriginalDescription,
  coerceBooleanOption,
  containsOriginalDetails,
  resolveOriginalDescription,
  getOriginalFromDocumentSource,
  getOriginalFromBabelePayload,
  extractOriginalFromExistingDetails,
};
export {
  getCompendiumSourceRef,
  parseCompendiumUuid,
  extractAllLocalizeKeys,
  withoutIdFields,
};
export {
  safeParseUuid,
  findIndexByUuid,
  findIndexByName,
  getCompendiumDataFromUUID,
  getCurrentCompendium,
  mappedCompendiumFor,
  translatedCompendiumFor,
  findBabeleEntry,
  mapWithBabeleMapping,
  getFallbackLocalizeText,
  stripOriginalUuidLabels,
};
export { registerPf2eBabeleHelpers };
export { convertRulesData, convertJournalPages };
export {
  sluggifyItemName,
  ensureItemSlug,
  buildTextPatch,
  convertActorEmbeddedItems,
  convertActorEmbeddedItem,
  convertEmbeddedSpellConsumable,
};
