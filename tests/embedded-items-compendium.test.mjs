import { describe, expect, test } from "@jest/globals";

// Mutable per-test parseUuid implementation; the stub installed on globalThis.foundry just
// delegates to whatever the current test assigned to parseUuidImpl. Same pattern as
// tests/compendium-lookup.test.mjs.
let parseUuidImpl = () => undefined;
globalThis.foundry = {
  utils: {
    parseUuid(uuid) {
      return parseUuidImpl(uuid);
    },
  },
};

// Mutable per-test Babele registry lookup. Real game.babele exposes mappedCompendiumFor(packName)
// returning { mapping, entries } (or a translations-array shape) - findBabeleEntry only needs
// mapping + an entries-bearing object keyed by the index row's identity (here: _id).
let mappedCompendiumForImpl = () => null;
globalThis.game = {
  babele: {
    mappedCompendiumFor(packName) {
      return mappedCompendiumForImpl(packName);
    },
  },
};

const { convertActorEmbeddedItem, convertEmbeddedSpellConsumable } = await import(
  "../scripts/converters/embedded-items.js"
);

describe("embedded-items.js compendium-hit paths - R7 pin (pre-R8 baseline)", () => {
  describe("1. convertItemFromCompendium happy path (via convertActorEmbeddedItem)", () => {
    test("compendium-sourced weapon: merged/translated result, range translated, both description fields get an Original block, name/slug set - RECORDS the babele mapping call shape too", () => {
      const weaponIndexRow = {
        _id: "weapon-longsword-1",
        name: "Longsword",
        uuid: "Compendium.pf2e.equipment-srd.Item.weapon-longsword-1",
      };
      const weaponCollection = {
        index: new Map([["weapon-longsword-1", weaponIndexRow]]),
        metadata: { id: "pf2e.equipment-srd" },
      };
      parseUuidImpl = (uuid) =>
        uuid === "Compendium.pf2e.equipment-srd.Item.weapon-longsword-1"
          ? { id: "weapon-longsword-1", collection: weaponCollection }
          : undefined;

      const weaponMapCalls = [];
      const weaponMapping = {
        map(documentData, translation, runtime, params) {
          weaponMapCalls.push({ documentData, translation, runtime, params });
          return {
            name: translation.name,
            system: {
              description: { value: translation.description },
              range: { value: "10 feet" },
            },
          };
        },
      };
      const weaponBabeleEntry = {
        _id: "weapon-longsword-1",
        name: "Довгий меч (компендіум)",
        description: "<p>Компендіумний опис довгого меча.</p>",
      };
      mappedCompendiumForImpl = (packName) =>
        packName === "pf2e.equipment-srd"
          ? { mapping: weaponMapping, entries: { "weapon-longsword-1": weaponBabeleEntry } }
          : null;

      // Real "Longsword" fixture item (tests/fixtures/embedded-items.json, item-weapon-1),
      // augmented with a compendium-source flag and a non-blank gm text (the real fixture's gm
      // is "" - blank gm text skips ensureOriginalDetailsForItemField entirely via
      // isBlankTranslation, so it can't demonstrate the cross-field leak below).
      const weaponItem = {
        _id: "item-weapon-1",
        name: "Longsword",
        type: "weapon",
        flags: { core: { sourceId: "Compendium.pf2e.equipment-srd.Item.weapon-longsword-1" } },
        system: {
          description: { value: "<p>A blade of versatile design.</p>", gm: "<p>GM only note.</p>" },
          rules: [],
          range: { value: null },
          slug: null,
        },
      };
      const context = { params: { showOriginalDescription: true } };

      const result = convertActorEmbeddedItem(weaponItem, undefined, undefined, context);

      expect(result).toStrictEqual({
        _id: "item-weapon-1",
        name: "Довгий меч (компендіум)",
        type: "weapon",
        flags: { core: { sourceId: "Compendium.pf2e.equipment-srd.Item.weapon-longsword-1" } },
        system: {
          description: {
            value:
              '<p>Компендіумний опис довгого меча.</p><hr/><details data-pf2e-uk-original="true"><summary>Original</summary><p>A blade of versatile design.</p></details>',
            // FIXED (see file header): this shows the item's own GM original text, not the
            // VALUE field's original - the cross-field leak in getOriginalFromDocumentSource's
            // fixed field-priority order is no longer reachable once an explicit originalPath
            // is passed for each field.
            gm:
              '<p>GM only note.</p><hr/><details data-pf2e-uk-original="true"><summary>Original</summary><p>GM only note.</p></details>',
          },
          rules: [],
          range: { value: "10 футів" },
          slug: "longsword",
        },
      });

      // The mapping was invoked with the merged effective translation (compendium entry, since
      // no per-actor translation override was supplied) and the untouched original item data.
      expect(weaponMapCalls).toStrictEqual([
        {
          documentData: weaponItem,
          translation: {
            _id: "weapon-longsword-1",
            name: "Довгий меч (компендіум)",
            description: "<p>Компендіумний опис довгого меча.</p>",
          },
          runtime: undefined,
          params: { showOriginalDescription: true },
        },
      ]);
    });
  });

  describe("2. convertItemFromCompendium MISS control (compendium resolves, but no Babele registration for that pack) -> falls through to direct translation", () => {
    test("armor with a valid compendium sourceId but an unregistered pack: same output shape as the plain direct-translation fallback", () => {
      const armorIndexRow = {
        _id: "armor-chainmail-1",
        name: "Chain Mail",
        uuid: "Compendium.pf2e.armor-nonbabele.Item.armor-chainmail-1",
      };
      const armorCollection = {
        index: new Map([["armor-chainmail-1", armorIndexRow]]),
        metadata: { id: "pf2e.armor-nonbabele" },
      };
      parseUuidImpl = (uuid) =>
        uuid === "Compendium.pf2e.armor-nonbabele.Item.armor-chainmail-1"
          ? { id: "armor-chainmail-1", collection: armorCollection }
          : undefined;
      // No pack named "pf2e.armor-nonbabele" in the registry -> mappedCompendiumFor misses,
      // proving this is a genuine Babele-registration miss, not a broken stub.
      mappedCompendiumForImpl = () => null;

      const armorItem = {
        _id: "item-armor-1",
        name: "Chain Mail",
        type: "armor",
        flags: { core: { sourceId: "Compendium.pf2e.armor-nonbabele.Item.armor-chainmail-1" } },
        system: {
          description: { value: "<p>Original chainmail description.</p>", gm: "" },
          slug: null,
        },
      };
      const armorTranslation = { name: "Кольчуга", description: "<p>Перекладений опис кольчуги.</p>" };

      const result = convertActorEmbeddedItem(armorItem, armorTranslation, undefined, { params: {} });

      expect(result).toStrictEqual({
        _id: "item-armor-1",
        name: "Кольчуга",
        type: "armor",
        flags: { core: { sourceId: "Compendium.pf2e.armor-nonbabele.Item.armor-chainmail-1" } },
        system: {
          description: { value: "<p>Перекладений опис кольчуги.</p>", gm: "" },
          slug: "chain-mail",
          rules: undefined, // convertRulesData(undefined, undefined) - own key present, value undefined
        },
      });
    });
  });

  describe("3. convertEmbeddedSpellConsumable happy path: description-synthesis branch + nested-spell branch together", () => {
    test("scroll with a blank per-actor description override synthesizes an @UUID-linked description from the compendium entry, AND translates the nested spell sub-document via its own compendium lookup", () => {
      const scrollIndexRow = {
        _id: "scroll-fireball-1",
        name: "Scroll of Fireball",
        uuid: "Compendium.pf2e.equipment-srd.Item.scroll-fireball-1",
      };
      const scrollCollection = {
        index: new Map([["scroll-fireball-1", scrollIndexRow]]),
        metadata: { id: "pf2e.equipment-srd" },
      };
      const spellIndexRow = {
        _id: "spell-fireball-1",
        name: "Fireball",
        uuid: "Compendium.pf2e.spells-srd.Item.spell-fireball-1",
      };
      const spellCollection = {
        index: new Map([["spell-fireball-1", spellIndexRow]]),
        metadata: { id: "pf2e.spells-srd" },
      };
      parseUuidImpl = (uuid) => {
        if (uuid === "Compendium.pf2e.equipment-srd.Item.scroll-fireball-1") {
          return { id: "scroll-fireball-1", collection: scrollCollection };
        }
        if (uuid === "Compendium.pf2e.spells-srd.Item.spell-fireball-1") {
          return { id: "spell-fireball-1", collection: spellCollection };
        }
        return undefined;
      };

      const scrollMapCalls = [];
      const scrollMapping = {
        map(documentData, translation, runtime, params) {
          scrollMapCalls.push({ documentData, translation, runtime, params });
          return { name: translation.name, system: { description: { value: translation.description } } };
        },
      };
      const spellMapCalls = [];
      const spellMapping = {
        map(documentData, translation, runtime, params) {
          spellMapCalls.push({ documentData, translation, runtime, params });
          return {
            name: translation.name,
            system: { description: { value: translation.description }, time: { value: "2 actions" } },
          };
        },
      };
      const scrollBabeleEntry = {
        _id: "scroll-fireball-1",
        name: "Сувій Вогняної кулі (компендіум)",
        description: "<p>Із компендіуму: сувій магічного згортка.</p>",
      };
      const spellBabeleEntry = {
        _id: "spell-fireball-1",
        name: "Вогняна куля",
        description: "<p>Куля вогню, що обпалює ворогів.</p>",
      };
      mappedCompendiumForImpl = (packName) => {
        if (packName === "pf2e.equipment-srd") {
          return { mapping: scrollMapping, entries: { "scroll-fireball-1": scrollBabeleEntry } };
        }
        if (packName === "pf2e.spells-srd") {
          return { mapping: spellMapping, entries: { "spell-fireball-1": spellBabeleEntry } };
        }
        return null;
      };

      // Real "Scroll of Fireball" fixture item (tests/fixtures/embedded-items.json,
      // item-scroll-1), augmented with a compendium-source flag on both the scroll and its
      // nested spell sub-document.
      const scrollData = {
        _id: "item-scroll-1",
        name: "Scroll of Fireball",
        type: "consumable",
        flags: { core: { sourceId: "Compendium.pf2e.equipment-srd.Item.scroll-fireball-1" } },
        system: {
          category: "scroll",
          description: { value: "<p>A scroll.</p>", gm: "" },
          spell: {
            name: "Fireball",
            uuid: null,
            flags: { core: { sourceId: "Compendium.pf2e.spells-srd.Item.spell-fireball-1" } },
          },
        },
      };
      // Traced trigger for the synthesis branch: it fires only when a per-item/actor-level
      // translation EXPLICITLY blanks the description (mergePatch's isNil override semantics -
      // an explicit "" overrides, but omitting the key or passing null/undefined does not),
      // while the compendium's own babele entry still carries a non-blank description.
      const scrollTranslation = { description: "" };

      const result = convertEmbeddedSpellConsumable(scrollData, scrollTranslation, { params: {} });

      expect(result).toStrictEqual({
        _id: "item-scroll-1",
        name: "Сувій Вогняної кулі (компендіум)",
        type: "consumable",
        flags: { core: { sourceId: "Compendium.pf2e.equipment-srd.Item.scroll-fireball-1" } },
        system: {
          category: "scroll",
          description: {
            value:
              "<p>@UUID[Compendium.pf2e.spells-srd.Item.spell-fireball-1]</p><hr><p>Із компендіуму: сувій магічного згортка.</p>",
            gm: "",
          },
          spell: {
            name: "Вогняна куля",
            uuid: null,
            flags: { core: { sourceId: "Compendium.pf2e.spells-srd.Item.spell-fireball-1" } },
            system: {
              description: { value: "<p>Куля вогню, що обпалює ворогів.</p>" },
              time: { value: "2 дії" },
            },
          },
        },
      });

      expect(scrollMapCalls[0].translation).toStrictEqual({
        _id: "scroll-fireball-1",
        name: "Сувій Вогняної кулі (компендіум)",
        description:
          "<p>@UUID[Compendium.pf2e.spells-srd.Item.spell-fireball-1]</p><hr><p>Із компендіуму: сувій магічного згортка.</p>",
      });
      expect(spellMapCalls[0].translation).toStrictEqual(spellBabeleEntry);
    });
  });

  describe("4. convertEmbeddedSpellConsumable MISS control (no compendium link at all) -> undefined", () => {
    test("scroll with no flags/_stats compendium source ref: returns undefined (caller falls back to direct translation)", () => {
      const scrollDataNoLink = {
        _id: "item-scroll-2",
        name: "Scroll of Lightning Bolt",
        type: "consumable",
        system: {
          category: "scroll",
          description: { value: "<p>Another scroll.</p>", gm: "" },
          spell: { name: "Lightning Bolt", uuid: null },
        },
      };

      const result = convertEmbeddedSpellConsumable(scrollDataNoLink, undefined, { params: {} });

      expect(result).toBe(undefined);
    });
  });

  describe("5. convertItemFromDirectTranslation (no compendium link at all -> falls through to direct translation): gm Original block must resolve the item's OWN gm original, not its value original", () => {
    test("weapon with no compendium sourceId, a non-blank gm original, and a translation for both fields: gm's Original block shows the gm original; value is unaffected", () => {
      const directItem = {
        _id: "item-dagger-1",
        name: "Dagger",
        type: "weapon",
        system: {
          description: {
            value: "<p>Original dagger description.</p>",
            gm: "<p>Original dagger gm secret.</p>",
          },
          rules: [],
          slug: null,
        },
      };
      const directTranslation = {
        name: "Кинджал",
        description: "<p>Перекладений опис кинджала.</p>",
        gm: "<p>Перекладена gm нотатка.</p>",
      };
      const context = { params: { showOriginalDescription: true } };

      // No flags/_stats compendium source ref -> convertItemFromCompendium misses, so
      // convertActorEmbeddedItem falls through to convertItemFromDirectTranslation.
      const result = convertActorEmbeddedItem(directItem, directTranslation, undefined, context);

      expect(result.system.description.value).toBe('<p>Перекладений опис кинджала.</p><hr/><details data-pf2e-uk-original="true"><summary>Original</summary><p>Original dagger description.</p></details>');
      expect(result.system.description.gm).toBe('<p>Перекладена gm нотатка.</p><hr/><details data-pf2e-uk-original="true"><summary>Original</summary><p>Original dagger gm secret.</p></details>');
    });
  });
});
