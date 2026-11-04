import { normalizeIsbn } from './bookLinks';
import { authorPeople, authorSimilarity, fold, titleSimilarity, titleVariants, type BookIdentity } from './bookMatch';

/**
 * Book search for submissions, across two open catalogues that complement each other: the German
 * National Library (DNB) knows German titles and current editions, Open Library knows English
 * titles and groups translations under one work key. Shop pages are never fetched. Everything is
 * best effort: a catalogue that fails just contributes no results.
 */

const USER_AGENT = 'bookclub (self-hosted book club app)';
const TIMEOUT_MS = 5000;
const MAX_RESULTS = 8;

export interface BookHit {
  title: string;
  author: string;
  isbn: string | null;
  /** Open Library work key, shared by editions and translations of a book. */
  workKey: string | null;
}

interface RankedHit extends BookHit {
  editions: number;
}

/** Not the book itself, but teaching material about or adapted from it. */
const STUDY_MATERIAL = /lektüre|einfacher sprache|interpretation|erläuterung|lernhilfe|unterricht|study guide|summary|sparknotes/i;

async function fetchWithTimeout(url: string, accept: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: { 'user-agent': USER_AGENT, accept }
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<any | null> {
  const res = await fetchWithTimeout(url, 'application/json');
  return res ? res.json().catch(() => null) : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, c: string) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** DNB titles look like "[Original] ; Titel : Untertitel | Werbung / Verfasser ; aus dem …". */
function dnbTitle(raw: string): string {
  return raw
    .replace(/^\[[^\]]*\]\s*;\s*/, '')
    .split(' / ')[0]
    .split(/\s[:|=]\s/)[0]
    .trim();
}

/** "Mann, Thomas,, 1875-1955 [Verfasser]" → "Thomas Mann". */
function dnbPerson(raw: string): string {
  // Some records lose the opening bracket: "Orlando, Carissa Verfasser]".
  const name = raw
    .split('[')[0]
    .replace(/\s*\S*\]\s*$/, '')
    .replace(/,+\s*\d{4}-?\d*\s*$/, '')
    .trim();
  const parts = name.split(/\s*,\s*/);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}

interface DnbRecord {
  rawTitle: string;
  author: string;
  isbn: string | null;
  language: string | undefined;
}

async function dnbRecords(q: string): Promise<DnbRecord[]> {
  const words = q.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  const params = new URLSearchParams({
    version: '1.1',
    operation: 'searchRetrieve',
    query: `${words.map((w) => `WOE=${w}`).join(' AND ')} AND mat=books`,
    recordSchema: 'oai_dc',
    maximumRecords: '30'
  });
  const res = await fetchWithTimeout(`https://services.dnb.de/sru/dnb?${params}`, 'application/xml');
  const xml = res ? await res.text().catch(() => '') : '';
  return xml
    .split(/<record(?:\s|>)/)
    .slice(1)
    .map((record) => {
      const creators = [...record.matchAll(/<dc:creator>([^<]*)/g)].map((m) => decodeXml(m[1]));
      // Translators and editors are creators too; prefer whoever is marked as the author.
      const authors = creators.filter((c) => /verfasser/i.test(c));
      return {
        rawTitle: decodeXml(record.match(/<dc:title>([^<]*)/)?.[1] ?? ''),
        author: (authors.length ? authors : creators.slice(0, 1)).map(dnbPerson).join(', '),
        isbn: normalizeIsbn(record.match(/<dc:identifier[^>]*>(97[89][\d-]{10,})/)?.[1]),
        language: record.match(/<dc:language>([^<]*)/)?.[1]
      };
    });
}

async function searchDnb(q: string): Promise<BookHit[]> {
  const hits: BookHit[] = [];
  for (const { rawTitle, author, isbn, language } of await dnbRecords(q)) {
    if (STUDY_MATERIAL.test(rawTitle) || (language && language !== 'ger' && language !== 'eng')) continue;
    const title = dnbTitle(rawTitle);
    if (title && author) hits.push({ title, author, isbn, workKey: null });
  }
  return hits;
}

async function searchOpenLibrary(q: string): Promise<BookHit[]> {
  const params = new URLSearchParams({
    q,
    fields: 'key,title,author_name,editions,editions.title,editions.isbn',
    limit: '15'
  });
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`);
  const hits: BookHit[] = [];
  for (const doc of data?.docs ?? []) {
    // The edition is the one that matched, so a German search shows the German title.
    const edition = doc.editions?.docs?.[0];
    const title = String(edition?.title ?? doc.title ?? '').trim();
    const author = (doc.author_name ?? []).slice(0, 3).join(', ');
    if (!title || !author || STUDY_MATERIAL.test(title)) continue;
    const workKey = typeof doc.key === 'string' && doc.key.startsWith('/works/') ? doc.key : null;
    hits.push({ title, author, isbn: normalizeIsbn(edition?.isbn?.[0]), workKey });
  }
  return hits;
}

function groupKey(hit: BookHit): string {
  const title = titleVariants(hit.title).at(-1) ?? fold(hit.title);
  return `${title}|${authorPeople(hit.author)[0]?.join(' ') ?? ''}`;
}

/** Results for a free-text query, one per book, best match first. */
export async function searchBooks(q: string): Promise<BookHit[]> {
  const [dnb, openLibrary] = await Promise.all([searchDnb(q), searchOpenLibrary(q)]);

  // Editions of one book become one result, collecting the ISBN and work key from wherever they are.
  const groups = new Map<string, RankedHit>();
  for (const hit of [...dnb, ...openLibrary]) {
    const key = groupKey(hit);
    const group = groups.get(key);
    if (group) {
      group.editions++;
      group.isbn ??= hit.isbn;
      group.workKey ??= hit.workKey;
    } else {
      groups.set(key, { ...hit, editions: 1 });
    }
  }

  const score = (hit: RankedHit) =>
    Math.max(titleSimilarity(q, hit.title), titleSimilarity(q, `${hit.title} ${hit.author}`)) +
    Math.min(hit.editions, 5) * 0.02;
  return [...groups.values()]
    .map((hit) => ({ hit, score: score(hit) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ hit: { title, author, isbn, workKey } }) => ({ title, author, isbn, workKey }));
}

// ---------- Identity of a book, to recognise translations ----------

interface BookQuery {
  title: string;
  author: string;
  isbn: string | null;
}

const IDENTITY_CACHE_MS = 10 * 60 * 1000;
const IDENTITY_CACHE_SIZE = 200;
const MAX_ISBN_LOOKUPS = 4;
const identityCache = new Map<string, { at: number; identity: BookIdentity }>();

function matchesBook(book: BookQuery, title: string, author: string): boolean {
  return titleSimilarity(book.title, title) >= 0.8 && authorSimilarity(book.author, author) >= 0.6;
}

async function workKeyForIsbn(isbn: string): Promise<string | null> {
  const edition = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);
  const key = edition?.works?.[0]?.key;
  return typeof key === 'string' && key.startsWith('/works/') ? key : null;
}

async function openLibraryWorkKeys(book: BookQuery): Promise<string[]> {
  const params = new URLSearchParams({
    q: `${book.title} ${book.author}`,
    fields: 'key,title,author_name,editions,editions.title',
    limit: '8'
  });
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`);
  const keys: string[] = [];
  for (const doc of data?.docs ?? []) {
    const titles = [doc.title, doc.editions?.docs?.[0]?.title].filter(Boolean);
    const author = (doc.author_name ?? []).join(', ');
    if (String(doc.key).startsWith('/works/') && titles.some((t: string) => matchesBook(book, t, author))) {
      keys.push(doc.key);
    }
  }
  return keys;
}

/** Original titles from "[Original] ; Titel" records of this book, plus its editions' ISBNs. */
async function dnbEditions(book: BookQuery): Promise<{ originalTitles: string[]; isbns: string[] }> {
  const authorWords = new Set(authorPeople(book.author).flat());
  const originalTitles = new Set<string>();
  const isbns = new Set<string>();
  for (const record of await dnbRecords(`${book.title} ${book.author}`)) {
    if (!matchesBook(book, dnbTitle(record.rawTitle), record.author)) continue;
    const original = record.rawTitle.match(/^\[([^\]]*)\]\s*;/)?.[1].replace(/\.$/, '').trim();
    // Some brackets only repeat the author ("[Kafka]"), which would match all their books.
    if (original && !fold(original).split(' ').every((word) => authorWords.has(word))) originalTitles.add(original);
    if (record.isbn) isbns.add(record.isbn);
  }
  return { originalTitles: [...originalTitles], isbns: [...isbns].slice(0, MAX_ISBN_LOOKUPS) };
}

/**
 * Wikidata items found by title whose description names the author ("novel by Kazuo Ishiguro").
 * Null if Wikidata didn't answer, which its strict rate limit makes more likely than elsewhere.
 * One request at a time, as its API rules ask.
 */
async function wikidataIds(book: BookQuery): Promise<string[] | null> {
  const surname = [...(authorPeople(book.author)[0] ?? [])].sort((a, b) => b.length - a.length)[0];
  if (!surname) return [];
  const ids: string[] = [];
  for (const language of ['de', 'en']) {
    const data = await fetchJson(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: 'wbsearchentities',
        search: book.title,
        language,
        uselang: language,
        type: 'item',
        limit: '7',
        format: 'json'
      })}`
    );
    if (!data) return null;
    for (const item of data.search ?? []) {
      if (fold(item.description ?? '').includes(surname)) ids.push(String(item.id));
    }
  }
  return ids;
}

/** Looks a book up in all catalogues. A catalogue that fails just contributes nothing. */
export async function findIdentity(book: BookQuery): Promise<BookIdentity> {
  const cacheKey = `${book.title}|${book.author}|${book.isbn ?? ''}`;
  const cached = identityCache.get(cacheKey);
  if (cached && Date.now() - cached.at < IDENTITY_CACHE_MS) return cached.identity;

  const [searched, dnb, wikidata] = await Promise.all([openLibraryWorkKeys(book), dnbEditions(book), wikidataIds(book)]);
  const isbns = [...new Set([...(book.isbn ? [book.isbn] : []), ...dnb.isbns])];
  const byIsbn = await Promise.all(isbns.map(workKeyForIsbn));
  const identity: BookIdentity = {
    workKeys: [...new Set([...searched, ...byIsbn.filter((k): k is string => !!k)])],
    originalTitles: dnb.originalTitles,
    wikidataIds: [...new Set(wikidata ?? [])]
  };

  // An incomplete answer must not stick: the next check may get through.
  if (wikidata) {
    if (identityCache.size >= IDENTITY_CACHE_SIZE) identityCache.clear();
    identityCache.set(cacheKey, { at: Date.now(), identity });
  }
  return identity;
}
