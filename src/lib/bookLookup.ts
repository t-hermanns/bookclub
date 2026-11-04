import { isAmazonShortHost, normalizeIsbn, parseHttpUrl, type NormalizedLink } from './bookLinks';
import { fold } from './bookMatch';

/**
 * Server-side metadata lookup for a pasted book link: reads title/author from the shop page
 * (JSON-LD, meta tags, <title>) and falls back to Google Books / Open Library by ISBN when a shop
 * blocks automated requests. Only the supported shop hosts are fetched (no open proxy / SSRF).
 * Everything here is best effort: failures return null and the user fills the fields in.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PAGE_TIMEOUT_MS = 6000;
const API_TIMEOUT_MS = 4000;
const MAX_BYTES = 2_000_000;

export interface LookupResult {
  title: string | null;
  author: string | null;
  isbn: string | null;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: {
        'user-agent': UA,
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...(init.headers ?? {})
      }
    });
  } catch {
    return null;
  }
}

async function readText(res: Response): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchJson(url: string): Promise<any | null> {
  const res = await fetchWithTimeout(url, API_TIMEOUT_MS, { headers: { accept: 'application/json' } });
  if (!res?.ok) return null;
  try {
    return JSON.parse((await readText(res)) ?? '');
  } catch {
    return null;
  }
}

function isFetchableHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return (
    /^thalia\.(de|at|ch)$/.test(h) ||
    h === 'suhrkamp.de' ||
    /^amazon\.(de|com|co\.uk|at|ch|fr|it|es|nl)$/.test(h) ||
    h === 'app.thestorygraph.com' ||
    h === 'thestorygraph.com'
  );
}

/** Follows an Amazon short link (amzn.eu/…) to its target without fetching anything else. */
export async function resolveShortLink(raw: string): Promise<string> {
  const u = parseHttpUrl(raw);
  if (!u || !isAmazonShortHost(u.hostname.toLowerCase())) return raw;
  let current = u.toString();
  for (let i = 0; i < 5; i++) {
    const res = await fetchWithTimeout(current, PAGE_TIMEOUT_MS, { redirect: 'manual', method: 'GET' });
    const loc = res?.headers.get('location');
    if (!res || res.status < 300 || res.status >= 400 || !loc) break;
    const next = new URL(loc, current);
    current = next.toString();
    if (!isAmazonShortHost(next.hostname.toLowerCase())) break;
  }
  return current;
}

// ---------- HTML parsing ----------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bdquo: '„', hellip: '…', middot: '·'
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const v = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return v || null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function personNames(v: any): string | null {
  const names = asArray(v)
    .map((p) => (typeof p === 'string' ? p : p?.name))
    .map(clean)
    .filter((x): x is string => !!x);
  return names.length ? [...new Set(names)].join(', ') : null;
}

function typeMatches(node: any, ...types: string[]): boolean {
  return asArray(node?.['@type']).some((t) => types.includes(String(t)));
}

/** All JSON-LD nodes on the page, flattened (@graph, arrays, workExample, mainEntity). */
function jsonLdNodes(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const visit = (n: any, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 4) return;
    if (Array.isArray(n)) return n.forEach((x) => visit(x, depth + 1));
    out.push(n);
    for (const k of ['@graph', 'workExample', 'mainEntity', 'itemOffered', 'exampleOfWork']) visit(n[k], depth + 1);
  };
  for (const m of html.matchAll(re)) {
    try {
      visit(JSON.parse(m[1].trim()), 0);
    } catch {
      // Ignore malformed blocks.
    }
  }
  return out;
}

function meta(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${esc}["']`, 'i');
  return clean(html.match(a)?.[1] ?? html.match(b)?.[1]);
}

/** Splits page titles like "Titel von Autor - Buch | Thalia" or "Titel : Autor : Amazon.de: Bücher". */
function splitPageTitle(raw: string): { title: string | null; author: string | null } {
  let s = raw
    .replace(/\s*[|–—-]\s*(thalia|suhrkamp( verlag)?|the storygraph|storygraph)\b.*$/i, '')
    .replace(/\s*[:|]\s*amazon\.[a-z.]+.*$/i, '')
    .replace(/^amazon\.[a-z.]+\s*:\s*/i, '')
    .replace(/\s+-\s+(buch|taschenbuch|ebook|e-book|hörbuch|gebundene ausgabe)\s*$/i, '')
    .trim();
  // Amazon: "Titel : Autor, Vorname : 9783…"
  const parts = s.split(/\s+:\s+/);
  if (parts.length >= 2) {
    const rest = parts.slice(1).filter((p) => !/^[\d\sX-]+$/i.test(p) && !/bücher|books|kindle/i.test(p));
    if (rest.length) return { title: clean(parts[0]), author: clean(rest[0]) };
  }
  const by = s.match(/^(.*\S)\s+(?:von|by)\s+(.+)$/i);
  if (by) return { title: clean(by[1]), author: clean(by[2]) };
  s = s.replace(/\s+-\s+.*$/, '');
  return { title: clean(s), author: null };
}

export function parseBookPage(html: string): LookupResult {
  let title: string | null = null;
  let author: string | null = null;
  let isbn: string | null = null;

  const nodes = jsonLdNodes(html);
  const book = nodes.find((n) => typeMatches(n, 'Book')) ?? nodes.find((n) => typeMatches(n, 'Product'));
  if (book) {
    title = clean(book.name);
    author = personNames(book.author) ?? personNames(book.creator) ?? personNames(book.brand?.['@type'] === 'Person' ? book.brand : null);
    isbn = normalizeIsbn(book.isbn) ?? normalizeIsbn(book.gtin13) ?? normalizeIsbn(book.gtin);
    // Thalia/StoryGraph nest the edition in workExample.
    for (const n of nodes) {
      if (!isbn) isbn = normalizeIsbn(n.isbn) ?? normalizeIsbn(n.gtin13);
      if (!author && typeMatches(n, 'Book')) author = personNames(n.author);
    }
  }

  const pageTitle = meta(html, 'og:title') ?? clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (pageTitle && (!title || !author)) {
    const split = splitPageTitle(pageTitle);
    title = title ?? split.title;
    author = author ?? split.author;
  }
  author =
    author ??
    meta(html, 'book:author') ??
    meta(html, 'author') ??
    clean(html.match(/<span[^>]+class=["'][^"']*author[^"']*["'][^>]*>\s*(?:<a[^>]*>)?([^<]{2,120})</i)?.[1]);
  if (author && /^https?:\/\//.test(author)) author = null;
  isbn =
    isbn ??
    normalizeIsbn(meta(html, 'book:isbn')) ??
    normalizeIsbn(html.match(/ISBN(?:-13)?\s*:?\s*(?:<[^>]+>\s*)*(97[89][\d-]{10,14})/i)?.[1]);
  if (title) title = title.replace(/\s+-\s+(buch|taschenbuch|ebook|e-book|hörbuch)\s*$/i, '');
  // "Autor: Titel" (publisher pages) → "Titel".
  if (title && author) {
    const first = author.split(',')[0].trim();
    if (first && title.toLowerCase().startsWith(`${first.toLowerCase()}:`)) title = title.slice(first.length + 1).trim();
  }
  if (title) title = title.replace(/[.\s]+(bücher|buch)\s*$/i, '').trim();
  return { title, author, isbn };
}

// ---------- ISBN / work lookups ----------

async function googleBooksByIsbn(isbn: string): Promise<LookupResult | null> {
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);
  const info = data?.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  const title = [info.title, info.subtitle].filter(Boolean).join(': ');
  return { title: clean(title), author: personNames(info.authors), isbn };
}

async function openLibraryByIsbn(isbn: string): Promise<LookupResult | null> {
  const data = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  );
  const b = data?.[`ISBN:${isbn}`];
  if (!b?.title) return null;
  return { title: clean(b.title), author: personNames(b.authors), isbn };
}

/**
 * Language-independent identity of a book: Open Library groups editions and translations of a
 * work under one work key (e.g. "/works/OL123W"). Tries the ISBN first, then a title/author search.
 */
export async function findWorkKey(book: { title: string; author: string; isbn: string | null }): Promise<string | null> {
  if (book.isbn) {
    const ed = await fetchJson(`https://openlibrary.org/isbn/${book.isbn}.json`);
    const key = ed?.works?.[0]?.key;
    if (typeof key === 'string' && key.startsWith('/works/')) return key;
  }
  const q = new URLSearchParams({ title: book.title, author: book.author, fields: 'key,title,author_name', limit: '5' });
  const data = await fetchJson(`https://openlibrary.org/search.json?${q}`);
  const docs: any[] = data?.docs ?? [];
  // Only trust a search hit whose author clearly matches (avoids wrong works for generic titles).
  const wanted = fold(book.author).split(' ').filter((t) => t.length > 2);
  const hit = docs.find((d) =>
    asArray<string>(d.author_name).some((a) => {
      const f = fold(a);
      return wanted.length > 0 && wanted.some((t) => f.includes(t));
    })
  );
  return typeof hit?.key === 'string' && hit.key.startsWith('/works/') ? hit.key : null;
}

/** Shop author fields → readable names: drops roles ("(Autor)", translators), flips "Kafka, Franz". */
export function tidyAuthor(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw
    .replace(/\s*\((autor(in)?|author)\)/gi, '')
    .replace(/^\s*(von|by)\s+/i, '');
  // Drop contributors that aren't authors: "Name (Übersetzer)", "Name (Hrsg.)" ...
  s = s
    .split(/\s*,\s*/)
    .filter((p) => !/\((übersetz|ubersetz|translator|illustr|sprecher|narrator|hrsg|herausgeb|editor|nachwort|vorwort)/i.test(p))
    .join(', ');
  const parts = s.split(/\s*,\s*/);
  if (parts.length === 2 && parts.every((p) => /^[^\s]+$/.test(p))) s = `${parts[1]} ${parts[0]}`;
  return s.trim() || null;
}

/** Title/author/ISBN for a (normalized) supported link, or null if nothing could be read. */
export async function lookupBook(n: NormalizedLink): Promise<LookupResult | null> {
  let result: LookupResult = { title: null, author: null, isbn: n.isbn };
  const u = parseHttpUrl(n.link);
  if (u && n.source && isFetchableHost(u.hostname)) {
    const res = await fetchWithTimeout(n.link, PAGE_TIMEOUT_MS, { redirect: 'follow' });
    const finalHost = res?.url ? parseHttpUrl(res.url)?.hostname : null;
    if (res?.ok && (!finalHost || isFetchableHost(finalHost))) {
      const html = await readText(res);
      if (html) {
        const parsed = parseBookPage(html);
        // Amazon's captcha page has a generic title; don't take that as a book.
        if (parsed.title && /^(amazon\.[a-z.]+|robot check|tut uns leid|sorry)/i.test(parsed.title)) parsed.title = null;
        result = { title: parsed.title, author: parsed.author, isbn: n.isbn ?? parsed.isbn };
      }
    }
  }
  if ((!result.title || !result.author) && result.isbn) {
    const byIsbn = (await googleBooksByIsbn(result.isbn)) ?? (await openLibraryByIsbn(result.isbn));
    if (byIsbn) result = { title: result.title ?? byIsbn.title, author: result.author ?? byIsbn.author, isbn: result.isbn };
  }
  result.author = tidyAuthor(result.author);
  return result.title || result.author ? result : null;
}
