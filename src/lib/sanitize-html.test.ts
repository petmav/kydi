import { describe, expect, it } from "vitest";
import { isBlankHtml, isSafeUrl, sanitizeHtml } from "@/lib/sanitize-html";

const noScript = (out: string) => {
  expect(out.toLowerCase()).not.toMatch(/<script|<iframe|<svg|<img|<object|<embed|<style|javascript:|vbscript:|data:|\son[a-z]+=/);
};

describe("sanitizeHtml: allowed markup", () => {
  it("keeps the editor's formatting tags", () => {
    const html = "<p>Hello <strong>bold</strong> <em>it</em> <u>u</u></p><ul><li>one</li></ul><ol><li>two</li></ol><h2>Title</h2><br>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps safe links and placeholders, adds rel to _blank links", () => {
    expect(sanitizeHtml('<a href="https://example.com/x?a=1&amp;b=2" target="_blank">x</a>')).toBe('<a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeHtml('<a href="mailto:a@b.co">m</a> <a href="{INVOICE_LINK}">l</a> <a href="/portal">p</a>')).toBe('<a href="mailto:a@b.co">m</a> <a href="{INVOICE_LINK}">l</a> <a href="/portal">p</a>');
  });

  it("keeps placeholders and escapes stray characters in text", () => {
    expect(sanitizeHtml("<p>{CONTACT_DISPLAY_NAME} owes 5 < 6 & more</p>")).toBe("<p>{CONTACT_DISPLAY_NAME} owes 5 &lt; 6 &amp; more</p>");
  });

  it("closes unclosed tags and ignores unmatched closers", () => {
    expect(sanitizeHtml("<p><strong>open")).toBe("<p><strong>open</strong></p>");
    expect(sanitizeHtml("text</div></p>")).toBe("text");
    expect(sanitizeHtml("<p><em>a</p>b")).toBe("<p><em>a</em></p>b");
  });
});

describe("sanitizeHtml: hostile input", () => {
  it("removes script elements with their content, in any case or spacing", () => {
    expect(sanitizeHtml("<p>a</p><script>alert(1)</script><p>b</p>")).toBe("<p>a</p><p>b</p>");
    expect(sanitizeHtml("<SCRIPT type='text/javascript'>alert(1)</SCRIPT >ok")).toBe("ok");
    expect(sanitizeHtml("<script>alert(1)</script")).toBe("");
    expect(sanitizeHtml("<script src=//evil.example/x.js></script>x")).toBe("x");
  });

  it("defeats split and nested script tags", () => {
    const a = sanitizeHtml("<scr<script>ipt>alert(1)</script>");
    noScript(a);
    expect(a).toBe("&lt;scr");
    const b = sanitizeHtml("<<script>script>alert(1)<</script>/script>");
    noScript(b);
    expect(b).not.toContain("alert");
  });

  it("strips event handler attributes with every quoting style", () => {
    expect(sanitizeHtml('<p onclick="alert(1)">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml("<p ONMOUSEOVER='alert(1)'>x</p>")).toBe("<p>x</p>");
    expect(sanitizeHtml("<b onfocus=alert(1) autofocus>x</b>")).toBe("<b>x</b>");
    expect(sanitizeHtml('<a href="https://ok.example" onclick="steal()">x</a>')).toBe('<a href="https://ok.example">x</a>');
  });

  it("drops disallowed elements that can run script", () => {
    noScript(sanitizeHtml('<img src=x onerror="alert(1)">'));
    noScript(sanitizeHtml("<svg onload=alert(1)><circle/></svg>after"));
    noScript(sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>'));
    noScript(sanitizeHtml('<object data="javascript:alert(1)"></object><embed src="x.swf">'));
    noScript(sanitizeHtml("<style>body{background:url(javascript:alert(1))}</style>"));
    noScript(sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p>'));
    noScript(sanitizeHtml('<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'));
    noScript(sanitizeHtml('<form action="javascript:alert(1)"><input type=submit></form>'));
  });

  it("removes javascript:, data: and vbscript: URLs including obfuscated forms", () => {
    const cases = [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href=" javascript:alert(1)">x</a>',
      '<a href="java&#x09;script:alert(1)">x</a>',
      '<a href="jav&#09;ascript:alert(1)">x</a>',
      '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
      '<a href="javascript&colon;alert(1)">x</a>',
      "<a href=javascript:alert(1)>x</a>",
      '<a href="\u0001javascript:alert(1)">x</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
    ];
    for (const c of cases) {
      const out = sanitizeHtml(c);
      expect(out, c).toBe("<a>x</a>");
    }
  });

  it("cannot break out of attribute quotes", () => {
    const out = sanitizeHtml(`<a href='x" onmouseover="alert(1)'>x</a>`);
    expect(out).toBe('<a href="x&quot; onmouseover=&quot;alert(1)">x</a>');
  });

  it("removes comments, doctype and conditional comments", () => {
    expect(sanitizeHtml("<!-- <script>alert(1)</script> -->ok")).toBe("ok");
    expect(sanitizeHtml("<!DOCTYPE html><p>x</p>")).toBe("<p>x</p>");
    expect(sanitizeHtml("<!--[if IE]><script>alert(1)</script><![endif]-->x")).toBe("x");
  });

  it("is idempotent", () => {
    const once = sanitizeHtml('<p onclick=x>a<script>b</script><a href="javascript:c">d</a></p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe("helpers", () => {
  it("classifies URLs", () => {
    expect(isSafeUrl("https://a.example")).toBe(true);
    expect(isSafeUrl("tel:+15551234")).toBe(true);
    expect(isSafeUrl("#top")).toBe(true);
    expect(isSafeUrl("javascript:void(0)")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });

  it("detects blank editor output", () => {
    expect(isBlankHtml("<p><br></p>")).toBe(true);
    expect(isBlankHtml("<p>&nbsp;</p>")).toBe(true);
    expect(isBlankHtml("<p>x</p>")).toBe(false);
  });
});
