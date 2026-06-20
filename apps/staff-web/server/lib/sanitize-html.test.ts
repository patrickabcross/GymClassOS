// sanitize-html.test.ts — CV4-01
// Unit tests for the Tiptap-HTML sanitizer.
// Run: npx vitest run --config vitest.unit.config.ts server/lib/sanitize-html.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeContentHtml } from "./sanitize-html.js";

describe("sanitizeContentHtml", () => {
  it("Test 1: allowlisted tags pass through unchanged", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    const result = sanitizeContentHtml(input);
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("Hello");
    expect(result).toContain("world");
  });

  it("Test 2: <script> tag is removed entirely", () => {
    const result = sanitizeContentHtml("<script>alert(1)</script>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("Test 3: onerror attribute is stripped; src is kept", () => {
    const result = sanitizeContentHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
    // src on img is allowlisted
    expect(result).toContain('src="x"');
  });

  it("Test 4: javascript: href is stripped or neutralized — no 'javascript:' in output", () => {
    const result = sanitizeContentHtml('<a href="javascript:alert(1)">x</a>');
    expect(result.toLowerCase()).not.toContain("javascript:");
    // The link text should survive
    expect(result).toContain("x");
  });

  it("Test 5: safe https href is kept", () => {
    const result = sanitizeContentHtml(
      '<a href="https://example.com">safe link</a>',
    );
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("safe link");
  });

  it("Test 6: allowlisted Tiptap tags survive — h1-h3, p, ul/ol/li, a, strong, em, img, br, blockquote, code, pre", () => {
    const input =
      "<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>" +
      "<p>Paragraph</p>" +
      "<ul><li>Item 1</li></ul>" +
      "<ol><li>Item 2</li></ol>" +
      "<a href=\"https://example.com\">link</a>" +
      "<strong>bold</strong><em>italic</em>" +
      '<img src="img.jpg" alt="desc">' +
      "<br>" +
      "<blockquote>quote</blockquote>" +
      "<code>inline code</code>" +
      "<pre>preformatted</pre>";
    const result = sanitizeContentHtml(input);
    expect(result).toContain("<h1>");
    expect(result).toContain("<h2>");
    expect(result).toContain("<h3>");
    expect(result).toContain("<p>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>");
    expect(result).toContain("<a ");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<img ");
    expect(result).toContain("<br");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<code>");
    expect(result).toContain("<pre>");
  });

  it("Test 7: disallowed tag <iframe> is removed (content unwrapped or dropped)", () => {
    const result = sanitizeContentHtml(
      "<iframe src=\"https://evil.com\">content</iframe>",
    );
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("evil.com");
  });
});
