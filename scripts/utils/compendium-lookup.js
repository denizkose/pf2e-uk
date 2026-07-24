import { isObject } from "./object-utils.js";
import { getCompendiumSourceRef } from "./compendium-refs.js";
import { logWarn } from "./log.js";

const UUID_LINK_RE = /@UUID\[([^#\]]+)(?:#([^\]]+))?](?:{([^}]+)})/g;

const COMPENDIUM_UUID_PREFIX = "Compendium.";

const NAME_INDEX_CACHE = new Map();

export function safeParseUuid(uuid) {
  if (!uuid || typeof uuid !== "string") return undefined;

  try {
    return globalThis.foundry?.utils?.parseUuid?.(uuid);
  } catch (error) {
    logWarn(`Cannot parse UUID: ${uuid}`, error);
    return undefined;
  }
}

function resolveCompendiumParts(uuid) {
  const uuidObject = safeParseUuid(uuid);
  const collection = uuidObject?.collection;
  const index = collection?.index?.get?.(uuidObject?.id);

  return { uuidObject, collection, index };
}

export function findIndexByUuid(uuid) {
  if (!uuid?.startsWith?.(COMPENDIUM_UUID_PREFIX)) return undefined;

  const { index } = resolveCompendiumParts(uuid);
  return index;
}

export function findIndexByName(name, packType = "Item") {
  if (!name) return undefined;

  const cacheKey = `${packType}:${name}`;
  if (NAME_INDEX_CACHE.has(cacheKey)) return NAME_INDEX_CACHE.get(cacheKey);

  const packs = globalThis.game?.packs?.filter?.((pack) => pack.metadata?.type === packType) ?? [];

  for (const pack of packs) {
    for (const entry of pack.index ?? []) {
      if (entry?.originalName === name || entry?.name === name) {
        NAME_INDEX_CACHE.set(cacheKey, entry);
        return entry;
      }
    }
  }

  NAME_INDEX_CACHE.set(cacheKey, undefined);
  return undefined;
}

export function getCompendiumDataFromUUID(uuid) {
  if (!uuid?.startsWith?.(COMPENDIUM_UUID_PREFIX)) return null;

  const { uuidObject, collection, index } = resolveCompendiumParts(uuid);
  const packName = collection?.metadata?.id;

  if (!uuidObject || !collection || !index || !packName) return null;

  return { uuidObject, collection, index, packName };
}

export function getCurrentCompendium(tc = undefined, runtime = undefined) {
  return runtime?.currentCompendium?.() ?? tc ?? null;
}

export function mappedCompendiumFor(packName) {
  return (
    globalThis.game?.babele?.mappedCompendiumFor?.(packName) ??
    globalThis.game?.babele?.translatedCompendiumFor?.(packName) ??
    null
  );
}

export function translatedCompendiumFor(packName) {
  return globalThis.game?.babele?.translatedCompendiumFor?.(packName) ?? null;
}

function getFallbackBabeleTranslation(packName) {
  return globalThis.game?.babele?.translations?.find?.((entry) => entry.collection === packName);
}

function getBabeleEntrySources(translatedCompendium, mappedCompendium, packName) {
  const fallbackTranslation = getFallbackBabeleTranslation(packName);

  return [
    fallbackTranslation?.entries,
    translatedCompendium?.translation?.entries,
    translatedCompendium?.translations?.entries,
    translatedCompendium?.entries,
    translatedCompendium?.translations,
    mappedCompendium?.translation?.entries,
    mappedCompendium?.translations?.entries,
    mappedCompendium?.entries,
    mappedCompendium?.translations,
  ].filter(isObject);
}

function getDocumentIdentityKeys(index, fallbackName = undefined) {
  return [
    index?._id,
    index?.id,
    index?.sourceId,
    getCompendiumSourceRef(index),
    index?.originalName,
    index?.name,
    fallbackName,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function findEntryInSources(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      if (key && source[key]) return source[key];
    }
  }
  return undefined;
}

export function findBabeleEntry(index, fallbackName = undefined, context = {}) {
  if (!index) return undefined;

  const uuidObject = index.uuid ? safeParseUuid(index.uuid) : undefined;
  const packName = uuidObject?.collection?.metadata?.id ?? context.packName;
  if (!packName) return undefined;

  const currentCompendium = getCurrentCompendium(context.tc, context.runtime);
  const mappedCompendium =
    currentCompendium?.collection === packName || currentCompendium?.metadata?.id === packName
      ? currentCompendium
      : mappedCompendiumFor(packName);
  const translatedCompendium = translatedCompendiumFor(packName);
  const mapping = mappedCompendium?.mapping ?? translatedCompendium?.mapping;

  if (!mapping) return undefined;

  const entry = findEntryInSources(
    getBabeleEntrySources(translatedCompendium, mappedCompendium, packName),
    getDocumentIdentityKeys(index, fallbackName),
  );

  if (!entry) return undefined;

  return {
    mapping,
    entry,
    packName,
    index,
    mappedCompendium,
    translatedCompendium,
  };
}

export function mapWithBabeleMapping(mapping, documentData, translation, context = {}) {
  if (!mapping?.map) return undefined;
  return mapping.map(documentData, translation, context.runtime, context.params);
}

export function getFallbackLocalizeText(key) {
  if (!key) return undefined;
  return globalThis.foundry?.utils?.getProperty?.(globalThis.game?.i18n?._fallback, key);
}

export function stripOriginalUuidLabels(value) {
  if (typeof value !== "string") return value;

  return value.replaceAll(UUID_LINK_RE, (_, uuid, section, label) => {
    const sectionSuffix = section ? `#${section}` : "";
    if (!label) return `@UUID[${uuid}${sectionSuffix}]`;

    const uuidObject = safeParseUuid(uuid);
    const originalName = uuidObject?.collection?.index?.get?.(uuidObject.id)?.originalName;
    const shouldDropLabel = originalName === label;

    return `@UUID[${uuid}${sectionSuffix}]${shouldDropLabel ? "" : `{${label}}`}`;
  });
}
