import { isBlankTranslation, deepGet } from "../utils/object-utils.js";
import { getModuleSetting, settingsKeys } from "../settings.js";

// Legacy Babele markers and labels remain readable for existing world documents.
const ORIGINAL_SEPARATOR = "<hr/>";
const ORIGINAL_ATTR = 'data-pf2e-uk-original="true"';
const LEGACY_BABELE_ATTR = 'data-babele-original="true"';
const ORIGINAL_DETAILS_SELECTOR = `details[${ORIGINAL_ATTR}], details[${LEGACY_BABELE_ATTR}]`;
const ORIGINAL_DETAILS_CLOSE = "</details>";
const ORIGINAL_SUMMARY_LABELS = new Set(["Original", "Оригінал", "Оригинал"]);

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "");
}

export function formatTranslatedName(originalName, translatedName, params = {}) {
  if (isBlankTranslation(translatedName)) return originalName;

  const showOriginal = params.showOriginal ?? getModuleSetting(
    settingsKeys.BABELE_SHOW_ORIGINAL_NAME,
    false,
  );

  if (showOriginal && originalName && originalName !== translatedName) {
    return `${translatedName} / ${originalName}`;
  }

  return translatedName;
}

export function formatTranslatedDescription(originalValue, translatedValue, source = undefined, params = {}) {
  if (isBlankTranslation(translatedValue)) return originalValue;

  const settingEnabled = getModuleSetting(settingsKeys.BABELE_SHOW_ORIGINAL_DESCRIPTION, false);
  const showOriginal = resolveShowOriginalDescription(params, settingEnabled);
  if (!showOriginal || resolveSkipOriginalDescription(params, settingEnabled)) return translatedValue;

  if (containsOriginalDetails(translatedValue)) return translatedValue;

  const original = resolveOriginalDescription(originalValue, source, params, translatedValue);
  if (isBlankTranslation(original)) return translatedValue;

  return `${translatedValue}${params.separator ?? ORIGINAL_SEPARATOR}${getOriginalDetailsOpen(params)}${original}${ORIGINAL_DETAILS_CLOSE}`;
}

export function shouldShowOriginalDescription(params = {}) {
  const settingEnabled = getModuleSetting(settingsKeys.BABELE_SHOW_ORIGINAL_DESCRIPTION, false);
  return resolveShowOriginalDescription(params, settingEnabled);
}

function resolveShowOriginalDescription(params, settingEnabled) {
  if (settingEnabled) return true;

  return coerceBooleanOption(
    params.showOriginalDescription ?? params.showOriginal,
    false,
  );
}

function resolveSkipOriginalDescription(params, settingEnabled) {
  if (settingEnabled) return false;
  return params.skipOriginal === true || params.showOriginalDescription === false || params.showOriginal === false;
}

export function coerceBooleanOption(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function getOriginalDetailsOpen(params = {}) {
  const label = params.originalLabel ?? params.originalSummary ?? (globalThis.game?.i18n?.localize?.("PF2E-UK.OriginalLabel") || "Original");
  return `<details ${ORIGINAL_ATTR}><summary>${label}</summary>`;
}

export function containsOriginalDetails(html) {
  if (typeof html !== "string") return false;
  if (html.includes(ORIGINAL_ATTR) || html.includes(LEGACY_BABELE_ATTR)) {
    return true;
  }

  return [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/gi)].some((match) => {
    const label = stripHtml(match[1]).trim();
    return ORIGINAL_SUMMARY_LABELS.has(label);
  });
}

export function resolveOriginalDescription(currentValue, source = undefined, params = {}, translatedValue = undefined) {
  return firstUsableOriginal([
    params.original,
    extractOriginalFromExistingDetails(translatedValue),
    extractOriginalFromExistingDetails(currentValue),
    getOriginalFromBabelePayload(source),
    getOriginalFromDocumentSource(source, params),
    currentValue,
  ]);
}

function firstUsableOriginal(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return "";
}

function rawThenNormal(source, path) {
  return [deepGet(source, `_source.${path}`), deepGet(source, path)];
}

export function getOriginalFromDocumentSource(source, params = {}) {
  if (!source) return undefined;

  const explicitPath = params.originalPath ?? params.sourcePath ?? params.path;
  if (explicitPath) {
    const found = firstUsableOriginal(rawThenNormal(source, explicitPath));
    if (found) return found;
  }

  return firstUsableOriginal([
    ...rawThenNormal(source, "system.description.value"),
    ...rawThenNormal(source, "system.description.gm"),
    ...rawThenNormal(source, "text.content"),
    ...rawThenNormal(source, "description"),
    typeof source?.toObject === "function" ? deepGet(source.toObject(false), "system.description.value") : undefined,
  ]);
}

export function getOriginalFromBabelePayload(source) {
  const payload = source?.flags?.babele?.originalPayload;
  return (
    payload?.description ??
    payload?.system?.description?.value ??
    payload?.text?.content ??
    undefined
  );
}

export function extractOriginalFromExistingDetails(html) {
  if (typeof html !== "string" || !html.includes("<details")) return "";

  if (globalThis.document?.implementation?.createHTMLDocument) {
    const doc = globalThis.document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;

    const details =
      doc.body.querySelector(ORIGINAL_DETAILS_SELECTOR) ||
      [...doc.body.querySelectorAll("details")].find((element) => {
        const label = element.querySelector("summary")?.textContent?.trim();
        return ORIGINAL_SUMMARY_LABELS.has(label);
      });

    if (!details) return "";

    const detailsClone = details.cloneNode(true);
    detailsClone.querySelector("summary")?.remove();
    return detailsClone.innerHTML.trim();
  }

  const match =
    html.match(/<details[^>]*(?:data-pf2e-uk-original|data-babele-original)="true"[^>]*>\s*<summary[^>]*>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i) ??
    html.match(/<details[^>]*>\s*<summary[^>]*>(?:Original|Оригінал|Оригинал)<\/summary>([\s\S]*?)<\/details>/i);
  return match?.[1]?.trim() ?? "";
}
