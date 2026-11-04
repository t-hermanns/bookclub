/**
 * Fuzzy title/author matching. Shops format the same book differently ("Hermann, Judith" vs
 * "Judith Hermann (Autor)", "Titel: Roman" vs "Titel - Taschenbuch"), and people make typos, so
 * both sides are cleaned up and compared by edit distance and token overlap. Pure functions.
 */

/** What the catalogues know about a book, to recognise translations of it. */
export interface BookIdentity {
  /** Open Library works: editions and translations of a book share one. */
  workKeys: string[];
  /** Original titles the German National Library lists for its German editions. */
  originalTitles: string[];
  /** Wikidata items, whose labels cover several languages. */
  wikidataIds: string[];
}

const ARTICLES = new Set(['der', 'die', 'das', 'ein', 'eine', 'the', 'a', 'an', 'le', 'la', 'les', 'el']);

/** Edition/format words shops add to the title; removed before comparing. */
const EDITION_NOISE = [
  /\b(ein\s+)?roman\b/g,
  /\berzahlung(en)?\b/g,
  /\bnovelle\b/g,
  /\ba\s+novel\b/g,
  /\bnovel\b/g,
  /\btaschenbuch\b/g,
  /\bgebundene\s+ausgabe\b/g,
  /\bgebunden\b/g,
  /\bbroschiert\b/g,
  /\bhardcover\b/g,
  /\bpaperback\b/g,
  /\bhardback\b/g,
  /\bkindle(\s+(ausgabe|edition|ebook))?\b/g,
  /\be-?book\b/g,
  /\bhorbuch\b/g,
  /\baudiobook\b/g,
  /\bsonderausgabe\b/g,
  /\bjubilaumsausgabe\b/g,
  /\bneuausgabe\b/g,
  /\bdeutsche\s+ausgabe\b/g,
  /\b(band|bd|vol|volume|teil|book|buch)\.?\s*\d+\b/g,
  /\bsuhrkamp\s+taschenbuch\b/g,
  /\bst\s*\d+\b/g
];

export function fold(s: string): string {
  return s
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'o')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dropArticles(tokens: string[]): string[] {
  return tokens.length > 1 && ARTICLES.has(tokens[0]) ? tokens.slice(1) : tokens;
}

/** Cleaned variants of a title: the full title and the main title without subtitle. */
export function titleVariants(raw: string): string[] {
  const noBrackets = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const main = noBrackets.split(/\s[-–—|]\s|:|\.\s/)[0];
  const out = new Set<string>();
  for (const v of [noBrackets, main]) {
    let f = fold(v);
    for (const re of EDITION_NOISE) f = f.replace(re, ' ');
    const tokens = dropArticles(f.split(/\s+/).filter(Boolean));
    if (tokens.length) out.add(tokens.join(' '));
  }
  return [...out];
}

/** Cleans an author field into a list of people, each a sorted token list. */
export function authorPeople(raw: string): string[][] {
  let s = raw
    .replace(/\((autor(in)?|author|hrsg\.?|herausgeber(in)?|editor|ubersetzer(in)?|übersetzer(in)?|translator|illustrator(in)?|sprecher(in)?)\)/gi, ' ')
    .replace(/^\s*(von|by|autor(in)?|author)\s*:?\s+/i, '');
  // Drop translators/editors and anything after them.
  s = s.split(/\b(übersetzt|ubersetzt|aus dem|translated|übersetzung|ubersetzung|übers\.|hrsg\.?|herausgegeben|mit einem nachwort|nachwort|vorwort|illustriert|illustrated|gelesen von|sprecher)\b/i)[0];
  // "Nachname, Vorname" (exactly one comma, no other separators) → one person. Two full names on
  // both sides ("Sally Rooney, Katia Benovich") are two people.
  const words = s.split(',').map((p) => p.trim().split(/\s+/).length);
  const parts =
    /^[^,;&/]+,[^,;&/]+$/.test(s) && !/\s(und|and)\s/i.test(s) && (words[0] === 1 || words[1] === 1)
      ? [s.split(',').reverse().join(' ')]
      : s.split(/[,;&/]|\s(?:und|and|u\.)\s/i);
  return parts
    .map((p) => fold(p).split(/\s+/).filter((t) => t.length > 0))
    .filter((t) => t.length > 0)
    .map((t) => [...t].sort());
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function tokenScore(a: string, b: string): number {
  const ta = a.split(' ');
  const tb = b.split(' ');
  // Each token of the shorter side matched to its best counterpart (typo-tolerant).
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const sum = short.reduce((acc, t) => acc + Math.max(...long.map((u) => ratio(t, u))), 0);
  return (sum / long.length) * 0.5 + (sum / short.length) * 0.5;
}

function stringScore(a: string, b: string): number {
  return Math.max(ratio(a, b), tokenScore(a, b), ratio(a.replace(/ /g, ''), b.replace(/ /g, '')));
}

export function titleSimilarity(a: string, b: string): number {
  let best = 0;
  for (const x of titleVariants(a)) for (const y of titleVariants(b)) best = Math.max(best, stringScore(x, y));
  return best;
}

function personSimilarity(a: string[], b: string[]): number {
  const full = ratio(a.join(' '), b.join(' '));
  // Same last name + matching initial (e.g. "J. Hermann" vs "Judith Hermann").
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // Initials alone prove nothing ("b" would match "Bertolt Brecht"), so a full name part must match.
  const covered =
    short.some((t) => t.length > 1) &&
    short.every((t) =>
      long.some((u) => ratio(t, u) >= 0.85 || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u)))
    );
  const longest = (xs: string[]) => xs.reduce((m, x) => (x.length > m.length ? x : m), '');
  const surname = ratio(longest(a), longest(b));
  return Math.max(full, covered && short.length > 0 ? 0.95 : 0, surname >= 0.85 && covered ? 0.95 : 0);
}

/** Best similarity of any author on one side to any author on the other. */
export function authorSimilarity(a: string, b: string): number {
  const pa = authorPeople(a);
  const pb = authorPeople(b);
  let best = 0;
  for (const x of pa) for (const y of pb) best = Math.max(best, personSimilarity(x, y));
  return best;
}

interface TitledBook {
  title: string;
  author: string;
}

/** Same words in title and author, ignoring case, accents, punctuation and name order. */
export function isExactlySameBook(a: TitledBook, b: TitledBook): boolean {
  const people = (s: string) => authorPeople(s).map((p) => p.join(' ')).sort().join('|');
  return fold(a.title) === fold(b.title) && people(a.author) === people(b.author);
}

export function isSimilarBook(a: TitledBook, b: TitledBook): boolean {
  return titleSimilarity(a.title, b.title) >= 0.8 && authorSimilarity(a.author, b.author) >= 0.6;
}

/** Whether the catalogues say that two books by the same author are one work, e.g. a translation. */
export function isSameWork(
  a: TitledBook & { identity: BookIdentity | null },
  b: TitledBook & { identity: BookIdentity | null }
): boolean {
  if (!a.identity || !b.identity || authorSimilarity(a.author, b.author) < 0.6) return false;
  const shared = (x: string[], y: string[]) => x.some((v) => y.includes(v));
  const matches = (titles: string[], other: string[]) =>
    titles.some((t) => other.some((o) => titleSimilarity(t, o) >= 0.85));
  return (
    shared(a.identity.workKeys, b.identity.workKeys) ||
    shared(a.identity.wikidataIds, b.identity.wikidataIds) ||
    matches(a.identity.originalTitles, [b.title, ...b.identity.originalTitles]) ||
    matches(b.identity.originalTitles, [a.title])
  );
}
