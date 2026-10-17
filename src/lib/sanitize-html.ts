/**
 * Allow-list HTML sanitiser for user-authored rich text (notes, email bodies, address formats; spec §10.2).
 * Pure TypeScript so the same rules run in the browser editor, on save and on render.
 *
 * - Only the tags in ALLOWED_TAGS survive; their text content is kept, other tags are removed.
 * - Elements in DROP_WITH_CONTENT (script, style, iframe, svg, ...) are removed together with their content.
 * - Only the attributes listed per tag survive. Links must be http(s), mailto, tel, relative, a fragment or a
 *   {PLACEHOLDER}; anything else (javascript:, data:, vbscript:, obfuscated variants) is dropped.
 * - Comments, doctypes and processing instructions are removed; stray "<" and "&" are escaped; unclosed tags
 *   are closed and unmatched closing tags are ignored, so the output is well formed.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup", "span", "div", "hr",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "noscript", "noembed", "noframes",
  "template", "svg", "math", "textarea", "select", "option", "title", "head", "xmp", "plaintext", "audio", "video",
]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "target"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
};

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", tab: "\t", newline: "\n", colon: ":" };

/** Decodes character references the way a browser would before interpreting a URL. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? m;
  });
}

const escapeText = (s: string) => s.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Control characters, whitespace and invisible formatting characters that browsers ignore inside a URL scheme.
const INVISIBLE = new RegExp("[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]", "g");

/** True for link targets that cannot execute script. */
export function isSafeUrl(raw: string): boolean {
  // Browsers ignore control characters and whitespace inside the scheme, so strip them before checking.
  const v = decodeEntities(raw).replace(INVISIBLE, "").toLowerCase();
  if (v === "") return false;
  if (/^\{[a-z0-9_]+\}$/i.test(decodeEntities(raw).trim())) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!scheme) return !v.startsWith("\\") && !/^[^/?#]*\\/.test(v);
  return ["http", "https", "mailto", "tel"].includes(scheme[1]);
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function cleanAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed || !raw) return "";
  const out: string[] = [];
  const seen = new Set<string>();
  let blank = false;
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (!allowed.includes(name) || seen.has(name)) continue;
    seen.add(name);
    if (name === "href") {
      if (!isSafeUrl(value)) continue;
      out.push(`href="${escapeAttr(decodeEntities(value).trim())}"`);
    } else if (name === "target") {
      if (value.toLowerCase() === "_blank") {
        out.push('target="_blank"');
        blank = true;
      }
    } else if (name === "colspan" || name === "rowspan") {
      if (/^\d{1,3}$/.test(value)) out.push(`${name}="${value}"`);
    } else {
      out.push(`${name}="${escapeAttr(decodeEntities(value))}"`);
    }
  }
  if (blank) out.push('rel="noopener noreferrer"');
  return out.length ? ` ${out.join(" ")}` : "";
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  const html = String(input);
  const out: string[] = [];
  const stack: string[] = [];
  let i = 0;
  let text = "";
  const flush = () => {
    if (text) out.push(escapeText(text));
    text = "";
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    i = lt;
    // Comments, CDATA, doctype and processing instructions: drop entirely.
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(html);
    if (!m) {
      // A "<" that does not start a well-formed tag. Unterminated tags of dangerous elements end the document.
      const rest = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i));
      if (rest && (DROP_WITH_CONTENT.has(rest[1].toLowerCase()) || !html.includes(">", i))) break;
      text += "<";
      i += 1;
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    i = TAG_RE.lastIndex;
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && m[4] !== "/") {
        const re = new RegExp(`</${tag}\\s*>`, "ig");
        re.lastIndex = i;
        const end = re.exec(html);
        i = end ? re.lastIndex : html.length;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    flush();
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at === -1) continue;
      while (stack.length > at) out.push(`</${stack.pop()}>`);
      continue;
    }
    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}>`);
      continue;
    }
    out.push(`<${tag}${cleanAttrs(tag, m[3])}>`);
    stack.push(tag);
  }
  flush();
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("");
}

/** True when the HTML has no visible text (used to store empty editors as null). */
export function isBlankHtml(html: string | null | undefined): boolean {
  return !html || decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/ /g, " ").trim() === "";
}

/** Sanitises rich text for storage; empty editor output becomes null. */
export function cleanRichText(html: string | null | undefined): string | null {
  const clean = sanitizeHtml(html);
  return isBlankHtml(clean) ? null : clean;
}
