/**
 * Tiny tag reader for the simple XML that library catalogues return.
 * (DOMParser would work in the browser, but this also runs in unit tests.)
 */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

/** Text of every <tag …>text</tag> (exact qualified name, e.g. "dc:title"). */
export function tagTexts(xml: string, tag: string): string[] {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc}>`, 'g');
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    const v = decodeXml(m[1]);
    if (v) out.push(v);
  }
  return out;
}

/** The first block between <tag> and </tag>, or ''. */
export function firstBlock(xml: string, tag: string): string {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc}>`).exec(xml)?.[1] ?? '';
}
