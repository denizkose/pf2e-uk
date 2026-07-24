import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { convertActorEmbeddedItem, sluggifyItemName } from "../scripts/converters/embedded-items.js";

describe("convertActorEmbeddedItem - notifyItemConversionError must not itself throw (PB.2)", () => {
  test("item.name is a throwing getter (the original exception source) - does not escape, returns item unchanged", () => {
    const item = {
      _id: "x",
      get name() {
        throw new Error("torn down");
      },
    };
    const actor = { name: "Hero", _id: "a1" };

    let result;
    expect(() => {
      result = convertActorEmbeddedItem(item, undefined, actor, {});
    }).not.toThrow();
    expect(result).toBe(item);
  });

  test("actor.name is a throwing getter - unguarded read in the handler does not escape, item still returned unchanged", () => {
    const item = {
      _id: "y",
      name: "Item Two",
      get system() {
        throw new Error("item system torn down");
      },
    };
    const actor = {
      get name() {
        throw new Error("actor torn down");
      },
      _id: "a2",
    };

    let result;
    expect(() => {
      result = convertActorEmbeddedItem(item, undefined, actor, {});
    }).not.toThrow();
    expect(result).toBe(item);
  });

  test("ui.notifications.error itself throws (torn-down runtime) - reporting does not escape, item still returned unchanged", () => {
    const item = {
      _id: "z",
      get name() {
        throw new Error("torn down");
      },
    };
    const actor = { name: "Hero", _id: "a3" };

    const originalUi = globalThis.ui;
    globalThis.ui = {
      notifications: {
        error() {
          throw new Error("ui exploded");
        },
      },
    };

    try {
      let result;
      expect(() => {
        result = convertActorEmbeddedItem(item, undefined, actor, {});
      }).not.toThrow();
      expect(result).toBe(item);
    } finally {
      globalThis.ui = originalUi;
    }
  });

  // INV-7 (docs/P2.5b-lang-charter.md §1/§5 step 1): every game.i18n access must live inside the
  // first (message-build) try, so a present-but-throwing i18n is caught there and never escapes.
  // Green vacuously today (notifyItemConversionError never calls game.i18n yet); after P2.5b's
  // developer change it meaningfully exercises the i18n-present-but-throws branch.
  test("game.i18n.format/localize throw (i18n present but torn down) - does not escape, returns item unchanged", () => {
    const item = {
      _id: "w",
      get name() {
        throw new Error("torn down");
      },
    };
    const actor = { name: "Hero", _id: "a4" };

    const originalGame = globalThis.game;
    globalThis.game = {
      i18n: {
        format() {
          throw new Error("i18n.format exploded");
        },
        localize() {
          throw new Error("i18n.localize exploded");
        },
      },
    };

    try {
      let result;
      expect(() => {
        result = convertActorEmbeddedItem(item, undefined, actor, {});
      }).not.toThrow();
      expect(result).toBe(item);
    } finally {
      globalThis.game = originalGame;
    }
  });
});

/**
 * ROADMAP PB.1 regression tests for sluggifyItemName's fallback branch.
 *
 * sluggifyItemName prefers game.pf2e.system.sluggify (absent under Node) and falls back to its
 * own regex when that is absent. Per docs/p3-invariant-charter.md fork F-8 (resolved), the
 * fallback's job is to stand in for that PF2E function, so its correct behavior is output-parity
 * with PF2E's `sluggify(text)` default (`camel: null`) algorithm - the old ASCII-only
 * `[^a-z0-9]+` class deleted every Cyrillic letter and disagreed with PF2E even on pure ASCII
 * apostrophes. These cases pin the PF2E-parity output; the two guards ahead of the fallback
 * (existing system.slug, and the live pf2eSluggify branch) are untouched and covered by the
 * "system.slug present" case below.
 */
describe("sluggifyItemName - fallback branch reproduces PF2E's sluggify(text, { camel: null }) (PB.1)", () => {
  test("Cyrillic name -> Cyrillic slug (was empty string before the fix)", () => {
    expect(sluggifyItemName({ name: "Довгий меч" })).toBe("довгий-меч");
  });

  test("Cyrillic name with a leading digit-bearing token -> collapsed to one hyphen (was \"1\" before the fix)", () => {
    expect(sluggifyItemName({ name: "Меч +1" })).toBe("меч-1");
  });

  test("Cyrillic name with an ASCII apostrophe is deleted, not hyphenated", () => {
    expect(sluggifyItemName({ name: "Кам'яний молот" })).toBe("камяний-молот");
  });

  test("ASCII apostrophe (U+0027) is deleted, not hyphenated (was \"alchemist-s-fire\" before the fix)", () => {
    expect(sluggifyItemName({ name: "Alchemist's Fire" })).toBe("alchemists-fire");
  });

  test("pure ASCII control case is unchanged from before the fix", () => {
    expect(sluggifyItemName({ name: "Long Sword +1" })).toBe("long-sword-1");
  });

  test("existing system.slug still wins over the name - fallback never runs", () => {
    expect(sluggifyItemName({ name: "Довгий меч", system: { slug: "longsword" } })).toBe("longsword");
  });
});

describe("spell-consumable trigger - GAP-5: OLD (category-set) vs NEW (system.spell presence) match-delta", () => {
  const OLD_SPELL_CONSUMABLE_CATEGORIES = new Set(["scroll", "spell-gem", "wand"]);
  function oldTrigger(item) {
    return item?.type === "consumable" && OLD_SPELL_CONSUMABLE_CATEGORIES.has(item?.system?.category);
  }
  function newTrigger(item) {
    return Boolean(item?.system?.spell);
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const embeddedItemsFixture = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "embedded-items.json"), "utf8"),
  );
  const realItems = embeddedItemsFixture.convertActorEmbeddedItem.map((c) => c.args[0]);

  const boundaryProbes = [
    {
      _id: "probe-wand-with-spell",
      name: "Wand of Fireball",
      type: "consumable",
      system: { category: "wand", spell: { name: "Fireball", uuid: null } },
    },
    {
      _id: "probe-wand-without-spell",
      name: "Empty Wand",
      type: "consumable",
      system: { category: "wand" },
    },
    {
      _id: "probe-spell-gem-with-spell",
      name: "Spell Gem of Bless",
      type: "consumable",
      system: { category: "spell-gem", spell: { name: "Bless", uuid: null } },
    },
    {
      _id: "probe-spell-gem-without-spell",
      name: "Uncharged Spell Gem",
      type: "consumable",
      system: { category: "spell-gem" },
    },
    {
      _id: "probe-scroll-without-spell",
      name: "Blank Scroll",
      type: "consumable",
      system: { category: "scroll" },
    },
    {
      _id: "probe-non-matching-category-with-spell",
      name: "Talisman of Fireball",
      type: "consumable",
      system: { category: "talisman", spell: { name: "Fireball", uuid: null } },
    },
    {
      _id: "probe-non-consumable-type-with-spell",
      name: "Malformed Weapon",
      type: "weapon",
      system: { spell: { name: "Fireball", uuid: null } },
    },
  ];

  const corpus = [...realItems, ...boundaryProbes];

  const evaluated = corpus.map((item) => ({
    id: item._id,
    name: item.name,
    slug: item.system?.slug ?? null,
    old: oldTrigger(item),
    new: newTrigger(item),
  }));
  const disagreements = evaluated.filter((entry) => entry.old !== entry.new);

  test(`measured delta over the corpus (pinned - gates the P2.3 trigger-flip go/no-go): ${disagreements.length} of ${corpus.length} items disagree`, () => {
    // Exposed for the orchestrator/developer reading test output, not asserted on:
    console.log("GAP-5 disagreeing items:", JSON.stringify(disagreements, null, 2));

    expect(corpus.length).toBe(11);
    expect(disagreements.length).toBe(5);
    expect(disagreements.map((entry) => entry.id)).toStrictEqual([
        "probe-wand-without-spell",
        "probe-spell-gem-without-spell",
        "probe-scroll-without-spell",
        "probe-non-matching-category-with-spell",
        "probe-non-consumable-type-with-spell",
      ]);
  });
});
