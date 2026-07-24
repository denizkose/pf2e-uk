import { getCompendiumSourceRef } from "./utils/compendium-refs.js";
import { logDebug } from "./utils/log.js";

const BABELE_HELPERS_FLAG = "__pf2eUkBabeleHelpersRegistered";

export function registerPf2eBabeleHelpers(babele = globalThis.game?.babele) {
  if (!babele || babele[BABELE_HELPERS_FLAG]) return;
  babele[BABELE_HELPERS_FLAG] = true;

  registerBabeleHelperSafe(babele, "registerIdentityExtractor", "identity extractor", "pf2e-uk-compendium-source", (document) =>
    getCompendiumSourceRef(document),
  );

  registerBabeleHelperSafe(babele, "registerIdentityExtractor", "identity extractor", "pf2e-uk-pf2e-slug", (document) =>
    document?.system?.slug ?? null,
  );

  registerBabeleHelperSafe(babele, "registerTranslationMatchStrategy", "match strategy", {
    name: "pf2e-uk-source-id",
    keyFor(data) {
      return getCompendiumSourceRef(data) ?? data?.sourceId ?? null;
    },
    // Match any supported source identifier, not only the first available one.
    matches(_data, key, entry) {
      if (!key || !entry) return false;
      return (
        entry.sourceId === key ||
        entry._stats?.compendiumSource === key ||
        entry.flags?.pf2e?.compendiumSource === key ||
        entry.flags?.core?.sourceId === key
      );
    },
  });
}

function registerBabeleHelperSafe(babele, methodName, label, ...args) {
  if (typeof babele[methodName] !== "function") return;

  const name = typeof args[0] === "string" ? args[0] : args[0]?.name;

  try {
    babele[methodName](...args);
    logDebug(`Registered Babele ${label}: ${name}`);
  } catch (error) {
    logDebug(`Babele ${label} not registered: ${name}`, error);
  }
}
