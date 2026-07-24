import { describe, expect, test } from "@jest/globals";

let parseUuidImpl = () => undefined;
globalThis.foundry = {
  utils: {
    parseUuid(uuid) {
      return parseUuidImpl(uuid);
    },
  },
};

const { findIndexByUuid, getCompendiumDataFromUUID } = await import("../scripts/utils/compendium-lookup.js");

describe("findIndexByUuid / getCompendiumDataFromUUID - R6 step A pin (pre-refactor baseline)", () => {
  describe("1. non-string / missing 'Compendium.' prefix input - guard short-circuits before parseUuid", () => {
    const cases = [
      ["number input", 42],
      ["boolean input", true],
      ["null input", null],
      ["undefined input", undefined],
      ["plain object input", {}],
      ["array input", []],
      ["string without Compendium. prefix", "Item.abc123"],
      ["empty string", ""],
    ];

    for (const [label, input] of cases) {
      test(`${label} -> findIndexByUuid returns undefined, getCompendiumDataFromUUID returns null, parseUuid never called`, () => {
        let called = false;
        parseUuidImpl = () => {
          called = true;
          return undefined;
        };

        expect(findIndexByUuid(input)).toBe(undefined);
        expect(getCompendiumDataFromUUID(input)).toBe(null);
        expect(called).toBe(false);
      });
    }
  });

  describe("2. parseUuid throws - safeParseUuid swallows it, no throw escapes either function", () => {
    test("findIndexByUuid does not throw, returns undefined", () => {
      parseUuidImpl = () => {
        throw new Error("torn down");
      };
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        let result;
        expect(() => {
          result = findIndexByUuid("Compendium.some.pack.Item.id1");
        }).not.toThrow();
        expect(result).toBe(undefined);
      } finally {
        console.warn = originalWarn;
      }
    });

    test("getCompendiumDataFromUUID does not throw, returns null", () => {
      parseUuidImpl = () => {
        throw new Error("torn down");
      };
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        let result;
        expect(() => {
          result = getCompendiumDataFromUUID("Compendium.some.pack.Item.id1");
        }).not.toThrow();
        expect(result).toBe(null);
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe("3. collection missing (parseUuid resolves an object, but no .collection field - e.g. unresolved pack)", () => {
    test("findIndexByUuid -> undefined", () => {
      parseUuidImpl = () => ({ id: "id1" }); // no `collection` key at all
      expect(findIndexByUuid("Compendium.some.pack.Item.id1")).toBe(undefined);
    });

    test("getCompendiumDataFromUUID -> null", () => {
      parseUuidImpl = () => ({ id: "id1" });
      expect(getCompendiumDataFromUUID("Compendium.some.pack.Item.id1")).toBe(null);
    });
  });

  describe("4. collection present but index miss (index.get(id) -> undefined)", () => {
    function makeUuidObject() {
      const collection = { index: new Map(), metadata: { id: "some.pack" } };
      return { id: "missing-id", collection };
    }

    test("findIndexByUuid -> undefined", () => {
      parseUuidImpl = makeUuidObject;
      expect(findIndexByUuid("Compendium.some.pack.Item.missing-id")).toBe(undefined);
    });

    test("getCompendiumDataFromUUID -> null", () => {
      parseUuidImpl = makeUuidObject;
      expect(getCompendiumDataFromUUID("Compendium.some.pack.Item.missing-id")).toBe(null);
    });
  });

  describe("5. DECISIVE DIVERGENCE (Trap-2) - index hit but collection.metadata.id absent", () => {
    test("metadata object present but .id key absent: findIndexByUuid returns the FULL index row (not undefined); getCompendiumDataFromUUID returns null", () => {
      const indexRow = { _id: "id1", name: "Row Name" };
      const collection = { index: new Map([["id1", indexRow]]), metadata: {} };
      parseUuidImpl = () => ({ id: "id1", collection });

      const foundResult = findIndexByUuid("Compendium.some.pack.Item.id1");
      expect(foundResult).toBe(indexRow); // exact same reference - the row IS returned
      expect(foundResult).not.toBe(undefined);

      const dataResult = getCompendiumDataFromUUID("Compendium.some.pack.Item.id1");
      expect(dataResult).toBe(null); // same index hit, but null here - the divergence
    });

    test("metadata property entirely absent from collection (not just .id): same divergence", () => {
      const indexRow = { _id: "id2", name: "Row Name 2" };
      const collection = { index: new Map([["id2", indexRow]]) }; // no `metadata` key at all
      parseUuidImpl = () => ({ id: "id2", collection });

      expect(findIndexByUuid("Compendium.some.pack.Item.id2")).toBe(indexRow);
      expect(getCompendiumDataFromUUID("Compendium.some.pack.Item.id2")).toBe(null);
    });
  });

  describe("6. full hit: collection + index row + metadata.id all present", () => {
    test("findIndexByUuid returns the exact index row (same reference)", () => {
      const indexRow = { _id: "id1", name: "Full Row", type: "weapon" };
      const collection = { index: new Map([["id1", indexRow]]), metadata: { id: "pf2e.equipment-srd" } };
      parseUuidImpl = () => ({ id: "id1", collection, type: "Item" });

      const result = findIndexByUuid("Compendium.pf2e.equipment-srd.Item.id1");
      expect(result).toBe(indexRow);
    });

    test("getCompendiumDataFromUUID returns { uuidObject, collection, index, packName } - every key/value enumerated", () => {
      const indexRow = { _id: "id1", name: "Full Row", type: "weapon" };
      const collection = { index: new Map([["id1", indexRow]]), metadata: { id: "pf2e.equipment-srd" } };
      const uuidObject = { id: "id1", collection, type: "Item" };
      parseUuidImpl = () => uuidObject;

      const result = getCompendiumDataFromUUID("Compendium.pf2e.equipment-srd.Item.id1");

      expect(Object.keys(result).sort()).toStrictEqual(["collection", "index", "packName", "uuidObject"]);
      expect(result.uuidObject).toBe(uuidObject);
      expect(result.collection).toBe(collection);
      expect(result.index).toBe(indexRow);
      expect(result.packName).toBe("pf2e.equipment-srd");
    });
  });
});
