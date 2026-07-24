import { clone, deepSet } from "./object-utils.js";

const WORD_CHAR = String.raw`[\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`;
const NON_WORD_CHAR = String.raw`[^\p{Alphabetic}\p{Mark}\p{Decimal_Number}\p{Join_Control}]`;
const NON_WORD_BOUNDARY = String.raw`(?=^|$|${WORD_CHAR})`;
const LOWER = String.raw`\p{Lowercase_Letter}`;
const UPPER = String.raw`\p{Uppercase_Letter}`;
const LOWER_THEN_UPPER_RE = new RegExp(`(${LOWER})(${UPPER}${NON_WORD_BOUNDARY})`, "gu");
const NON_WORD_CHAR_RE = new RegExp(NON_WORD_CHAR, "gu");
const APOSTROPHE_RE = /['’]/g;
const DASH_OR_SPACE_RE = /[-\s]+/g;

export function sluggifyItemName(item) {
  const currentSlug = item?.system?.slug;
  if (currentSlug) return currentSlug;

  const name = item?.name ?? "";
  const pf2eSluggify = globalThis.game?.pf2e?.system?.sluggify;
  if (typeof pf2eSluggify === "function") return pf2eSluggify(name);

  const text = String(name);
  if (text === "-") return text;

  return text
    .replace(LOWER_THEN_UPPER_RE, "$1-$2")
    .toLowerCase()
    .replace(APOSTROPHE_RE, "")
    .replace(NON_WORD_CHAR_RE, " ")
    .trim()
    .replace(DASH_OR_SPACE_RE, "-");
}

export function ensureItemSlug(item, slug) {
  if (!slug) return item;
  const result = clone(item);
  deepSet(result, "system.slug", slug);
  return result;
}
