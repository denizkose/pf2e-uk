import { isObject } from "./object-utils.js";

const LOCALIZE_RE = /@Localize\[([^\]]+)]/g;

export function getCompendiumSourceRef(documentLike) {
  return (
    documentLike?._stats?.compendiumSource ??
    documentLike?.flags?.pf2e?.compendiumSource ??
    documentLike?.flags?.core?.sourceId ??
    null
  );
}

export function parseCompendiumUuid(ref) {
  const match = /^Compendium\.([^.]+)\.([^.]+)\.([A-Za-z]+)\.([A-Za-z0-9]+)$/.exec(
    ref ?? "",
  );

  if (!match) return null;

  const [, packageId, packName, documentType, documentId] = match;
  return {
    packId: `${packageId}.${packName}`,
    packageId,
    packName,
    documentType,
    documentId,
    docId: documentId,
  };
}

export function extractAllLocalizeKeys(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(LOCALIZE_RE)].map((match) => match[1]);
}

export function withoutIdFields(value) {
  if (!isObject(value)) return value ?? {};

  const result = { ...value };
  delete result.id;
  delete result._id;
  delete result["-=id"];
  delete result["-=_id"];
  return result;
}
