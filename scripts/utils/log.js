import { MODULE_ID } from "../constants.js";
import { getModuleSetting, settingsKeys } from "../settings.js";

export function logDebug(message, ...args) {
  if (!getModuleSetting(settingsKeys.BABELE_DEBUG_CONVERTERS, false)) return;
  console.debug(`[${MODULE_ID}] ${message}`, ...args);
}

export function logWarn(message, ...args) {
  console.warn(`[${MODULE_ID}] ${message}`, ...args);
}

export function logError(message, ...args) {
  console.error(`[${MODULE_ID}] ${message}`, ...args);
}
