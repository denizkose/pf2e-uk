import {
  defaultMerge,
  range,
  time,
  duration,
  name,
  description,
  prerequisites,
  rules,
  journal,
  items,
} from "./converters/converters.js";
import { MODULE_ID } from "./constants.js";
import { initSettings } from "./settings.js";
import { registerPf2eBabeleHelpers } from "./babele-registration.js";
import { registerWelcomeWindow } from "./welcome.js";
import { logWarn } from "./utils/log.js";
import mapping from "./mapping.js";

const BASE = `modules/${MODULE_ID}/data/`;

const MODULES = Object.freeze([
  "pf2e-animal-companions",
  "pf2e-kingmaker-tools"
]);

const BABELE_DIRS = Object.freeze([
  "data/pf2e/packs",
  ...MODULES.map((moduleId) => `data/modules/${moduleId}/packs`),
]);

let babeleRegistered = false;

export async function registerTranslations(babele = globalThis.game?.babele) {
  if (!babele || babeleRegistered) return;
  babeleRegistered = true;

  registerPf2eBabeleHelpers(babele);

  babele.registerConverters({
    defaultMerge,
    range,
    time,
    duration,
    name,
    description,
    prerequisites,
    rules,
    journal,
    items,
  });

  babele.registerMapping(mapping);

  babele.register({
    module: MODULE_ID,
    lang: "uk",
    dir: BABELE_DIRS,
  });
}

Hooks.once("babele.init", registerTranslations);

Hooks.once("init", () => {
  initSettings();
  registerWelcomeWindow();
});

