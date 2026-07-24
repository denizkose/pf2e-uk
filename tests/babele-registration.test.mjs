import { describe, expect, test } from "@jest/globals";
import { registerPf2eBabeleHelpers } from "../scripts/babele-registration.js";

function createBabeleStub() {
  return {
    identityExtractors: [],
    matchStrategies: [],
    registerIdentityExtractor(name, fn) {
      this.identityExtractors.push({ name, fn });
    },
    registerTranslationMatchStrategy(strategy) {
      this.matchStrategies.push(strategy);
    },
  };
}

describe("registerPf2eBabeleHelpers - registered names", () => {
  test("registers exactly one identity extractor for compendium-source and one for pf2e-slug, in that order", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);

    expect(babele.identityExtractors.map((e) => e.name)).toStrictEqual(["pf2e-uk-compendium-source", "pf2e-uk-pf2e-slug"]);
  });

  test("registers exactly one translation match strategy named pf2e-uk-source-id", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);

    expect(babele.matchStrategies.map((s) => s.name)).toStrictEqual(["pf2e-uk-source-id"]);
  });
});

describe("registerPf2eBabeleHelpers - compendium-source extractor precedence", () => {
  test("_stats.compendiumSource wins over flags.pf2e.compendiumSource and flags.core.sourceId", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[0].fn;

    const doc = {
      _stats: { compendiumSource: "Compendium.stats.ref" },
      flags: {
        pf2e: { compendiumSource: "Compendium.pf2e.ref" },
        core: { sourceId: "Compendium.core.ref" },
      },
    };

    expect(extractor(doc)).toBe("Compendium.stats.ref");
  });

  test("flags.pf2e.compendiumSource wins over flags.core.sourceId when _stats is absent", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[0].fn;

    const doc = {
      flags: {
        pf2e: { compendiumSource: "Compendium.pf2e.ref" },
        core: { sourceId: "Compendium.core.ref" },
      },
    };

    expect(extractor(doc)).toBe("Compendium.pf2e.ref");
  });

  test("flags.core.sourceId is used when _stats and flags.pf2e are both absent", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[0].fn;

    const doc = { flags: { core: { sourceId: "Compendium.core.ref" } } };

    expect(extractor(doc)).toBe("Compendium.core.ref");
  });

  test("returns null when none of _stats/flags.pf2e/flags.core carry a source ref", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[0].fn;

    expect(extractor({})).toBe(null);
    expect(extractor(undefined)).toBe(null);
  });
});

describe("registerPf2eBabeleHelpers - pf2e-slug extractor", () => {
  test("returns document.system.slug when present", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[1].fn;

    expect(extractor({ system: { slug: "fireball" } })).toBe("fireball");
  });

  test("returns null when system.slug is absent", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[1].fn;

    expect(extractor({ system: {} })).toBe(null);
  });

  test("returns null when system itself is absent", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const extractor = babele.identityExtractors[1].fn;

    expect(extractor(undefined)).toBe(null);
  });
});

describe("registerPf2eBabeleHelpers - match strategy keyFor precedence", () => {
  test("keyFor prefers getCompendiumSourceRef's chain (_stats) over data.sourceId", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { keyFor } = babele.matchStrategies[0];

    const data = { _stats: { compendiumSource: "Compendium.stats.ref" }, sourceId: "fallback.id" };
    expect(keyFor(data)).toBe("Compendium.stats.ref");
  });

  test("keyFor falls back to data.sourceId when the compendium-source chain is empty", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { keyFor } = babele.matchStrategies[0];

    expect(keyFor({ sourceId: "fallback.id" })).toBe("fallback.id");
  });

  test("keyFor returns null when neither the compendium-source chain nor sourceId is present", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { keyFor } = babele.matchStrategies[0];

    expect(keyFor({})).toBe(null);
    expect(keyFor(undefined)).toBe(null);
  });
});

describe("registerPf2eBabeleHelpers - match strategy matches() any-of semantics", () => {
  test("false when key is falsy, regardless of entry", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    expect(matches(undefined, null, { sourceId: "x" })).toBe(false);
    expect(matches(undefined, "", { sourceId: "" })).toBe(false);
  });

  test("false when entry is falsy, regardless of key", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    expect(matches(undefined, "some-key", null)).toBe(false);
    expect(matches(undefined, "some-key", undefined)).toBe(false);
  });

  test("true when only entry.sourceId matches the key (1st field)", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    const entry = { sourceId: "key-1" };
    expect(matches(undefined, "key-1", entry)).toBe(true);
  });

  test("true when only entry._stats.compendiumSource matches the key (2nd field), sourceId mismatched", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    const entry = { sourceId: "other-id", _stats: { compendiumSource: "key-2" } };
    expect(matches(undefined, "key-2", entry)).toBe(true);
  });

  test("true when only entry.flags.pf2e.compendiumSource matches the key (3rd field), earlier fields mismatched", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    const entry = {
      sourceId: "other-id",
      _stats: { compendiumSource: "other-stats-ref" },
      flags: { pf2e: { compendiumSource: "key-3" } },
    };
    expect(matches(undefined, "key-3", entry)).toBe(true);
  });

  test("true when only entry.flags.core.sourceId matches the key (4th field), all earlier fields mismatched", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    const entry = {
      sourceId: "other-id",
      _stats: { compendiumSource: "other-stats-ref" },
      flags: { pf2e: { compendiumSource: "other-pf2e-ref" }, core: { sourceId: "key-4" } },
    };
    expect(matches(undefined, "key-4", entry)).toBe(true);
  });

  test("false when the key matches none of the 4 identity fields", () => {
    const babele = createBabeleStub();
    registerPf2eBabeleHelpers(babele);
    const { matches } = babele.matchStrategies[0];

    const entry = {
      sourceId: "other-id",
      _stats: { compendiumSource: "other-stats-ref" },
      flags: { pf2e: { compendiumSource: "other-pf2e-ref" }, core: { sourceId: "other-core-ref" } },
    };
    expect(matches(undefined, "no-match-key", entry)).toBe(false);
  });
});

describe("registerPf2eBabeleHelpers - idempotence", () => {
  test("a second call on the same babele instance registers nothing new", () => {
    const babele = createBabeleStub();

    registerPf2eBabeleHelpers(babele);
    expect(babele.identityExtractors.length).toBe(2);
    expect(babele.matchStrategies.length).toBe(1);

    registerPf2eBabeleHelpers(babele);
    expect(babele.identityExtractors.length).toBe(2);
    expect(babele.matchStrategies.length).toBe(1);
  });

  test("returns without throwing when babele is missing/falsy", () => {
    expect(() => registerPf2eBabeleHelpers(undefined)).not.toThrow();
    expect(() => registerPf2eBabeleHelpers(null)).not.toThrow();
  });
});

describe("registerPf2eBabeleHelpers - tolerance", () => {
  test("skips identity-extractor registration (no throw) when registerIdentityExtractor is not a function", () => {
    const babele = {
      matchStrategies: [],
      // registerIdentityExtractor intentionally absent (not a function).
      registerTranslationMatchStrategy(strategy) {
        this.matchStrategies.push(strategy);
      },
    };

    expect(() => registerPf2eBabeleHelpers(babele)).not.toThrow();
    expect(babele.matchStrategies.length).toBe(1);
  });

  test("skips match-strategy registration (no throw) when registerTranslationMatchStrategy is not a function", () => {
    const babele = {
      identityExtractors: [],
      registerIdentityExtractor(name, fn) {
        this.identityExtractors.push({ name, fn });
      },
      // registerTranslationMatchStrategy intentionally absent (not a function).
    };

    expect(() => registerPf2eBabeleHelpers(babele)).not.toThrow();
    expect(babele.identityExtractors.length).toBe(2);
  });

  test("a throwing registerIdentityExtractor is caught, and match-strategy registration still runs", () => {
    const babele = {
      matchStrategies: [],
      registerIdentityExtractor() {
        throw new Error("simulated identity-extractor registration failure");
      },
      registerTranslationMatchStrategy(strategy) {
        this.matchStrategies.push(strategy);
      },
    };

    expect(() => registerPf2eBabeleHelpers(babele)).not.toThrow();
    expect(babele.matchStrategies.length).toBe(1);
    expect(babele.matchStrategies[0].name).toBe("pf2e-uk-source-id");
  });
});
