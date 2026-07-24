import { MODULE_ID } from "./constants.js";

export const settingsKeys = Object.freeze({
  BABELE_SHOW_ORIGINAL_NAME: "babeleShowOriginalName",
  BABELE_SHOW_ORIGINAL_DESCRIPTION: "babeleShowOriginalDescription",
  BABELE_SHOW_LOCALIZE_ORIGINALS: "babeleShowLocalizeOriginals",
  BABELE_DEBUG_CONVERTERS: "babeleDebugConverters",
  WELCOME_SKIP: "welcomeSkip",
});

const SETTINGS = Object.freeze({
  general: [
    {
      key: settingsKeys.BABELE_SHOW_ORIGINAL_NAME,
      name: "Оригінальні назви",
      description: "Показувати назви у форматі: українська / англійська.",
      default: true,
      requiresReload: true,
    },
    {
      key: settingsKeys.BABELE_SHOW_ORIGINAL_DESCRIPTION,
      name: "Оригінальні описи",
      description: "Додавати англійський оригінал під перекладеним описом.",
      default: true,
      requiresReload: true,
    },
    {
      key: settingsKeys.WELCOME_SKIP,
      name: "Не показувати вікно вітання",
      description:
        "Якщо увімкнено, вікно вітання pf2e-uk більше не буде показуватись для цього користувача.",
      scope: "client",
      type: Boolean,
      config: true,
      default: false,
      restricted: false,
      requiresReload: false,
    },
  ],
  advanced: [
    {
      key: settingsKeys.BABELE_SHOW_LOCALIZE_ORIGINALS,
      name: "Оригінали @Localize у описах",
      description:
        "Додавати fallback-текст для @Localize[...] у блок оригіналу, коли це можливо.",
      default: true,
      requiresReload: true,
    },
    {
      key: settingsKeys.BABELE_DEBUG_CONVERTERS,
      name: "Debug Babele-конверторів",
      description: "Писати додаткові діагностичні повідомлення у консоль.",
      default: false,
      config: false,
      requiresReload: false,
    },
  ],
});

export function initSettings() {
  for (const sectionSettings of Object.values(SETTINGS)) {
    for (const setting of sectionSettings) {
      game.settings.register(MODULE_ID, setting.key, {
        name: setting.name,
        hint: setting.description,
        scope: setting.scope ?? "world",
        type: setting.type ?? Boolean,
        config: setting.config ?? true,
        default: setting.default ?? false,
        restricted: setting.restricted ?? true,
        requiresReload: setting.requiresReload ?? true,
      });
    }
  }
}

export function getModuleSetting(settingKey, fallback = false) {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, settingKey) ?? fallback;
  } catch (error) {
    console.warn(`[${MODULE_ID}] Cannot read setting ${settingKey}`, error);
    return fallback;
  }
}
