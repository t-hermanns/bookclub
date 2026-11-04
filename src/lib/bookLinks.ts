/**
 * Book links: strip tracking parameters and reduce links from the supported shops to a canonical
 * form, so the same book pasted twice (with different ref/ad parameters) compares equal.
 * Pure functions, safe to use on client and server.
 */

export type BookSource = 'thalia' | 'suhrkamp' | 'amazon' | 'storygraph';

export interface NormalizedLink {
  /** Cleaned link to store and show. */
  link: string;
  source: BookSource | null;
  /** Shop-specific identity of the book (e.g. "thalia:A1074248559"), null for other sites. */
  key: string | null;
  /** ISBN-13 if it can be read from the link itself. */
  isbn: string | null;
}

export const SUPPORTED_SOURCES: Record<BookSource, string> = {
  thalia: 'Thalia',
  suhrkamp: 'Suhrkamp',
  amazon: 'Amazon',
  storygraph: 'StoryGraph'
};

const TRACKING_PARAM = /^(utm_.*|gclid|gclsrc|gbraid|wbraid|dclid|gad_.*|fbclid|msclkid|mc_.*|_ga|_gl|provid|ref|ref_|refid|referrer|tag|linkcode|linkid|camp|creative|creativeasin|psc|th|smid|spia|sr|qid|keywords|crid|sprefix|dib|dib_tag|content-id|pd_rd_.*|pf_rd_.*|social_share|share|si|igshid|campaign|source|medium|affiliate.*|partner.*)$/i;

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isAmazonHost(host: string): boolean {
  return /(^|\.)amazon\.[a-z.]{2,6}$/.test(host);
}

export function isAmazonShortHost(host: string): boolean {
  return ['amzn.eu', 'amzn.to', 'a.co', 'amzn.de'].some((d) => hostIs(host, d));
}

/** ISBN-10 → ISBN-13 (978 prefix); null if not a valid ISBN-10. */
export function isbn10to13(isbn10: string): string | null {
  const s = isbn10.toUpperCase();
  if (!/^\d{9}[\dX]$/.test(s)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  if (sum % 11 !== 0) return null;
  const core = `978${s.slice(0, 9)}`;
  return core + isbn13Check(core);
}

function isbn13Check(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Normalizes an ISBN (10 or 13, with or without dashes) to ISBN-13, or null. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s) && (s.startsWith('978') || s.startsWith('979'))) {
    return isbn13Check(s.slice(0, 12)) === s[12] ? s : null;
  }
  if (s.length === 10) return isbn10to13(s);
  return null;
}

function stripTracking(u: URL): void {
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  }
  u.hash = '';
}

export function parseHttpUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

/** Returns null if `raw` is not an http(s) URL. */
export function normalizeLink(raw: string): NormalizedLink | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = decodeURIComponentSafe(u.pathname);

  if (/^thalia\.(de|at|ch)$/.test(host) || hostIs(host, 'thalia.de')) {
    const m = path.match(/\/(A\d{5,}|ID\d{5,})(?:\.html)?(?:\/|$)/i) ?? path.match(/\b(A\d{6,})\b/i);
    if (m) {
      const id = m[1].toUpperCase();
      const tld = host.match(/thalia\.(de|at|ch)$/)?.[1] ?? 'de';
      return {
        link: `https://www.thalia.${tld}/shop/home/artikeldetails/${id}${id.startsWith('ID') ? '.html' : ''}`,
        source: 'thalia',
        key: `thalia:${id}`,
        isbn: null
      };
    }
  }

  if (isAmazonHost(host)) {
    const m = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (m) {
      const asin = m[1].toUpperCase();
      const tld = host.replace(/^.*?amazon\./, '');
      return {
        link: `https://www.amazon.${tld}/dp/${asin}`,
        source: 'amazon',
        key: `amazon:${asin}`,
        isbn: isbn10to13(asin)
      };
    }
  }

  if (hostIs(host, 'suhrkamp.de')) {
    const clean = new URL(u.toString());
    clean.search = '';
    clean.hash = '';
    clean.hostname = 'www.suhrkamp.de';
    const isbn = normalizeIsbn(path.match(/-(\d{13}|\d{9}[\dX])\/?$/i)?.[1]);
    const slug = path.replace(/\/+$/, '').toLowerCase();
    return { link: clean.toString(), source: 'suhrkamp', key: `suhrkamp:${slug}`, isbn };
  }

  if (hostIs(host, 'thestorygraph.com')) {
    const m = path.match(/\/books\/([0-9a-f-]{20,})/i);
    if (m) {
      const id = m[1].toLowerCase();
      return {
        link: `https://app.thestorygraph.com/books/${id}`,
        source: 'storygraph',
        key: `storygraph:${id}`,
        isbn: null
      };
    }
  }

  stripTracking(u);
  const isbn = normalizeIsbn(path.match(/(?:^|[^\d])(97[89]\d{10})(?:[^\d]|$)/)?.[1]);
  return { link: u.toString(), source: null, key: null, isbn };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
