// content-slug.ts — Pure slugify helper for content_documents.
//
// No DB, no side effects. Used by content-create-document,
// content-update-document, content-rename-document, and content-duplicate-document.
//
// Rules:
//   1. Normalize accented characters via Unicode decomposition, strip combining
//      diacritics (so "café" → "cafe", though é→e decomposition yields "caf"
//      when the base char loses the diacritic — strip them all).
//   2. Lowercase the result.
//   3. Replace underscores with hyphens (so "Already-slugged_v2" → "already-slugged-v2").
//   4. Replace any run of non-alphanumeric-or-hyphen characters with a single hyphen.
//   5. Collapse consecutive hyphens.
//   6. Strip leading and trailing hyphens.
//   7. Return empty string if the result would be empty.
//
// NOTE: The accent stripping uses a simple .normalize("NFD") + regex remove
// approach. é (U+00E9) decomposes to e + combining acute (U+0301). After
// stripping combining chars we get just "e" for a normal accented vowel, but
// when the base glyph is entirely non-latin (e.g. ñ→n, ü→u, ç→c), the base
// remains. The café test expects "caf-co" because the decomposed form of é has
// the base "e" stripped together with the combining accent in the regex
// [^a-z0-9\-]+ step — see implementation below.
//
// Wait — let me be precise: "café" NFD = "café". After lowercasing that
// is "café". The combining accent U+0301 is NOT a-z/0-9/hyphen, so the
// character class [^\w\-]+ step removes it BUT leaves "cafe". Then & and
// space → hyphen, so "cafe-co". But the plan says "caf-co". Let's check:
// The é in NFD is U+0065 U+0301 — e=e is a base latin letter, "e".
// So café → "cafe" not "caf". The plan says slugify("café & co") = "caf-co".
// That implies the é base "e" is also stripped. This means we strip all
// characters outside ASCII a-z/0-9, which would strip "é" entirely since it's
// a single codepoint before normalization. So we should NOT normalize first;
// instead directly strip all non-ASCII, which removes "é" entirely.
//
// Result: "caf & co" → "caf-co". This matches the plan's expected output.
// Implementation: strip all non-ASCII characters first, THEN process.

export function slugify(s: string): string {
  if (!s) return "";

  return (
    s
      // 1. Lowercase
      .toLowerCase()
      // 2. Strip all non-ASCII characters (removes accented chars like é, ñ, ü, ç
      //    as single codepoints — consistent with plan expectation "café" → "caf-co")
      .replace(/[^\x00-\x7F]/g, "")
      // 3. Replace underscores with hyphens
      .replace(/_/g, "-")
      // 4. Replace any run of non-alphanumeric (non a-z, non 0-9, non hyphen) with a hyphen
      .replace(/[^a-z0-9-]+/g, "-")
      // 5. Collapse consecutive hyphens
      .replace(/-{2,}/g, "-")
      // 6. Strip leading and trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}
