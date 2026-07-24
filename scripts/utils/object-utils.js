export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNil(value) {
  return value === undefined || value === null;
}

export function isBlankTranslation(value) {
  return value === undefined || value === null || value === "";
}

export function mergeData(data, translation) {
  if (isNil(translation)) return data;
  if (isNil(data)) return translation;

  if (Array.isArray(data)) {
    if (!Array.isArray(translation)) return data;
    return data.map((entry, index) => mergeData(entry, translation[index]));
  }

  if (!isObject(data) || !isObject(translation)) return translation;

  const result = {};
  for (const key of Object.keys(data)) {
    result[key] = mergeData(data[key], translation[key]);
  }
  return result;
}

export function mergePatch(base, patch) {
  if (isNil(patch)) return base;
  if (!isObject(base) || !isObject(patch)) return patch;

  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = mergePatch(base[key], value);
  }
  return result;
}

export function deepGet(obj, path, fallback = undefined) {
  if (!path) return obj ?? fallback;

  const value = String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

  return value === undefined ? fallback : value;
}

export function deepSet(target, path, value) {
  const keys = String(path).split(".").filter(Boolean);
  if (!keys.length) return target;

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!isObject(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }

  cursor[keys[keys.length - 1]] = value;
  return target;
}

export function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(value);
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function mergeFoundryObject(base, patch) {
  const mergeObject = globalThis.foundry?.utils?.mergeObject;
  if (mergeObject) {
    return mergeObject(base ?? {}, patch ?? {}, {
      inplace: false,
      performDeletions: true,
    });
  }

  return mergePatch(base ?? {}, patch ?? {});
}

export function capitalizeFirst(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
